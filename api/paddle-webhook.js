import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifyPaddleSignature(rawBody, signature, secret) {
  try {
    const parts = {};
    signature.split(';').forEach(part => {
      const [k, v] = part.split('=');
      parts[k.trim()] = v?.trim();
    });
    const timestamp = parts['ts'];
    const h1 = parts['h1'];
    if (!timestamp || !h1) return false;
    const signed = `${timestamp}:${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function upsertUserPlan(email, plan, paddleCustomerId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      email,
      plan,
      paddle_id: paddleCustomerId,
      updated_at: new Date().toISOString()
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['paddle-signature'];
  const secret = process.env.PADDLE_WEBHOOK_SECRET;

  if (secret && signature) {
    const valid = verifyPaddleSignature(rawBody, signature, secret);
    if (!valid) {
      console.error('Invalid Paddle signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event.event_type || event.alert_name;
  const data = event.data || event;

  console.log('Paddle event:', eventType);

  try {
    // Map Paddle price IDs to plan names
    const PRICE_TO_PLAN = {
      [process.env.PADDLE_PRO_PRICE_ID || 'pri_01kr27md5ss7qg7t7jht2y1v3c']: 'pro',
      [process.env.PADDLE_BUSINESS_PRICE_ID || 'pri_01kr27q8b0yc9355fj4mzxszd0']: 'business'
    };

    const customerEmail = data?.customer?.email
      || data?.custom_data?.email
      || data?.items?.[0]?.price?.custom_data?.email
      || null;

    const priceId = data?.items?.[0]?.price?.id
      || data?.subscription?.items?.[0]?.price?.id
      || null;

    const customerId = data?.customer?.id || data?.customer_id || null;

    switch (eventType) {
      case 'transaction.completed':
      case 'subscription.activated':
      case 'subscription.created': {
        if (customerEmail && priceId) {
          const plan = PRICE_TO_PLAN[priceId] || 'pro';
          await upsertUserPlan(customerEmail, plan, customerId);
          console.log(`✅ Plan set: ${customerEmail} → ${plan}`);
        }
        break;
      }

      case 'subscription.canceled':
      case 'subscription.paused': {
        if (customerEmail) {
          await upsertUserPlan(customerEmail, 'free', customerId);
          console.log(`🔽 Plan downgraded: ${customerEmail} → free`);
        }
        break;
      }

      case 'subscription.resumed':
      case 'subscription.updated': {
        if (customerEmail && priceId) {
          const plan = PRICE_TO_PLAN[priceId] || 'pro';
          await upsertUserPlan(customerEmail, plan, customerId);
          console.log(`🔄 Plan updated: ${customerEmail} → ${plan}`);
        }
        break;
      }

      case 'transaction.payment_failed': {
        console.log(`⚠️ Payment failed for: ${customerEmail}`);
        // Don't downgrade immediately on payment failure — Paddle retries
        break;
      }

      default:
        console.log('Unhandled event:', eventType);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
