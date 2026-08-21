import nodemailer, { Transporter } from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter: Transporter | null = null;
let isEtherealAccount = false;

/**
 * Initialize Nodemailer Transporter
 * Uses SMTP settings from process.env if provided;
 * otherwise automatically generates an Ethereal test account for dev mode.
 */
export async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT) || 587;

  if (host && user && pass) {
    // Production / Custom SMTP Transporter (e.g. Gmail, SendGrid, Amazon SES)
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      family: 4,
      auth: { user, pass },
    } as any);
    isEtherealAccount = false;
    console.log(`✉️ Email Transporter configured via SMTP (${host}:${port})`);
  } else {
    // Development Mode: Auto-generate Ethereal Test Account
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      isEtherealAccount = true;
      console.log(`✉️ Dev Mode: Initialized Ethereal Test Email Account (${testAccount.user})`);
    } catch (err) {
      console.warn('⚠️ Could not create Ethereal test account. Falling back to JSON transport.');
      transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html: string;
}

/**
 * Core sendEmail helper
 */
export async function sendEmail(options: EmailOptions) {
  try {
    const mailer = await getTransporter();
    const from = process.env.SMTP_FROM || '"DLM Logistics Engine" <no-reply@dlm-logistics.com>';

    const info = await mailer.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text || options.subject,
      html: options.html,
    });

    console.log(`📧 [Email Dispatched] To: ${options.to} | Subject: "${options.subject}"`);

    if (isEtherealAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`🔗 [Ethereal Email Preview URL]: ${previewUrl}`);
      }
    }

    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${options.to}:`, error);
  }
}

// --------------------------------------------------------------------------
// HTML EMAIL TEMPLATES FOR DLM LOGISTICS EVENTS
// --------------------------------------------------------------------------

/**
 * 1. Welcome Email (Topic: user.created)
 */
export async function sendWelcomeEmail(to: string, name: string, role: string) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5001';
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8;">
        <div style="background: #1e293b; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">📦 Welcome to DLM Logistics</h1>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #0f172a;">Hello ${name},</h2>
          <p>Your account has been successfully created with the role of <strong>${role}</strong>.</p>
          <p>You can now log in to manage your shipments, monitor inventory in real-time, and track order fulfillment across all warehouses.</p>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${frontendUrl}/login" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Access Dashboard</a>
          </div>
          <p style="font-size: 12px; color: #64748b;">If you did not sign up for DLM Logistics, please ignore this message.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: '🎉 Welcome to DLM Logistics Platform',
    html,
  });
}

/**
 * 2. Order Confirmation Email (Topic: order.created)
 */
export async function sendOrderConfirmationEmail(to: string, orderId: string, trackingNumber: string, amount: number) {
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8;">
        <div style="background: #0f766e; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🛒 Order Confirmation</h1>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #0f172a;">Order #${orderId} Confirmed!</h2>
          <p>Thank you for your order. We are preparing it for shipment from our warehouse network.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f8fafc;">
              <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Tracking Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; color: #0284c7;">${trackingNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Total Amount:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">$${amount.toFixed(2)}</td>
            </tr>
          </table>
          <p>Track your shipment status in real-time on our live map pipeline.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: `📦 Order Confirmation #${orderId}`,
    html,
  });
}

/**
 * 3. Package Shipped Email (Topic: package.shipped)
 */
export async function sendPackageShippedEmail(to: string, trackingNumber: string, currentLocation: string) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5001';
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8;">
        <div style="background: #0284c7; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🚚 Package Dispatched</h1>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #0f172a;">Your package is on the way!</h2>
          <p>Package tracking ID <strong>${trackingNumber}</strong> has departed origin warehouse and is currently at <strong>${currentLocation}</strong>.</p>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${frontendUrl}/tracking?tn=${trackingNumber}" style="background: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Track Package Live</a>
          </div>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: `🚚 Shipment Dispatched (${trackingNumber})`,
    html,
  });
}

/**
 * 4. Package Delivered Email (Topic: package.delivered)
 */
export async function sendPackageDeliveredEmail(to: string, trackingNumber: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8;">
        <div style="background: #16a34a; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">✅ Package Delivered</h1>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #0f172a;">Shipment Delivered Successfully!</h2>
          <p>Package <strong>${trackingNumber}</strong> has been delivered to its final destination.</p>
          <p>Thank you for relying on DLM Logistics Engine!</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: `✅ Package Delivered (${trackingNumber})`,
    html,
  });
}

/**
 * 5. Low Stock Alert Email (Topic: inventory.updated)
 */
export async function sendLowStockAlertEmail(
  to: string,
  productName: string,
  sku: string,
  warehouseName: string,
  currentStock: number,
  reorderLevel: number
) {
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8;">
        <div style="background: #dc2626; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">⚠️ LOW STOCK WARNING ALERT</h1>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #991b1b; margin-top: 0;">Inventory Threshold Warning</h2>
          <p>Inventory level for <strong>${productName}</strong> (SKU: <code>${sku}</code>) at <strong>${warehouseName}</strong> has dropped below the safety reorder threshold.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #fee2e2;">
              <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #fca5a5; color: #991b1b;">Current Stock:</td>
              <td style="padding: 10px; border-bottom: 1px solid #fca5a5; font-weight: bold; color: #dc2626;">${currentStock} units</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Reorder Threshold Limit:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${reorderLevel} units</td>
            </tr>
          </table>
          <p style="color: #475569;">Please issue a stock replenishment order immediately to avoid stockout errors.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: `⚠️ LOW STOCK ALERT: ${productName} (${currentStock} units left)`,
    html,
  });
}
