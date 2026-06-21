const nodemailer = require('nodemailer');

// ── Create transporter ────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   Number(process.env.EMAIL_PORT),
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Base email template ───────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; font-family:'Segoe UI',Arial,sans-serif; background:#f4f4f4; }
    .wrapper { max-width:600px; margin:0 auto; padding:20px; }
    .card { background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .header { background:#1e1b4b; padding:24px 32px; text-align:center; }
    .logo { font-size:24px; font-weight:700; color:#ffffff; letter-spacing:-0.5px; }
    .logo span { color:#f97316; }
    .body { padding:32px; }
    .title { font-size:20px; font-weight:600; color:#111827; margin:0 0 8px; }
    .subtitle { font-size:14px; color:#6b7280; margin:0 0 24px; }
    .info-box { background:#f9fafb; border-radius:8px; padding:16px; margin:16px 0; }
    .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:13px; }
    .info-row:last-child { border-bottom:none; }
    .info-label { color:#6b7280; }
    .info-value { color:#111827; font-weight:500; }
    .btn { display:inline-block; background:#4f46e5; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:600; font-size:14px; margin:16px 0; }
    .status-badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
    .badge-success  { background:#d1fae5; color:#065f46; }
    .badge-warning  { background:#fef3c7; color:#92400e; }
    .badge-info     { background:#dbeafe; color:#1e40af; }
    .badge-purple   { background:#ede9fe; color:#5b21b6; }
    .badge-danger   { background:#fee2e2; color:#991b1b; }
    .divider { height:1px; background:#f3f4f6; margin:20px 0; }
    .footer { padding:20px 32px; background:#f9fafb; text-align:center; }
    .footer p { font-size:12px; color:#9ca3af; margin:4px 0; }
    .footer a { color:#4f46e5; text-decoration:none; }
    .item-row { display:flex; gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid #f3f4f6; }
    .item-row:last-child { border-bottom:none; }
    .item-name { font-size:13px; font-weight:500; color:#111827; }
    .item-qty  { font-size:12px; color:#6b7280; }
    .item-price { font-size:13px; font-weight:600; color:#4f46e5; margin-left:auto; }
    .alert-box { border-left:4px solid #f97316; background:#fff7ed; padding:12px 16px; border-radius:0 8px 8px 0; margin:16px 0; }
    .alert-box p { margin:0; font-size:13px; color:#9a3412; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">Nep<span>Shop</span></div>
        <p style="color:#a5b4fc;font-size:12px;margin:4px 0 0;">Nepal's Smart Marketplace</p>
      </div>
      ${content}
      <div class="footer">
        <p>© 2026 NepShop. All rights reserved.</p>
        <p>Kathmandu, Bagmati Province, Nepal</p>
        <p><a href="#">Unsubscribe</a> · <a href="#">Privacy Policy</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ── Send email helper ─────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to,
      subject,
      html:    baseTemplate(html),
    });
    console.log(`✅ Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`❌ Email failed to ${to}:`, error.message);
    // Don't throw — email failure should not break the main flow
  }
};

// ─────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────

// ── 1. Welcome email (customer) ───────────────────────────
const sendWelcomeEmail = (user) => sendEmail({
  to:      user.email,
  subject: 'Welcome to NepShop! 🎉',
  html: `
    <div class="body">
      <h2 class="title">Welcome to NepShop, ${user.firstName}! 🎉</h2>
      <p class="subtitle">Your account has been created successfully.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Name</span>
          <span class="info-value">${user.firstName} ${user.lastName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${user.email}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Role</span>
          <span class="info-value">Customer</span>
        </div>
      </div>
      <p style="font-size:14px;color:#374151;">
        You can now browse thousands of products, add them to your cart, and checkout securely using Khalti or eSewa.
      </p>
      <a href="http://localhost:5173/login" class="btn">Start Shopping →</a>
    </div>
  `,
});

// ── 2. Seller application submitted ──────────────────────
const sendSellerApplicationEmail = (user) => sendEmail({
  to:      user.email,
  subject: 'Your NepShop Seller Application has been received',
  html: `
    <div class="body">
      <h2 class="title">Application Received! ⏳</h2>
      <p class="subtitle">Thank you for applying to sell on NepShop.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Shop Name</span>
          <span class="info-value">${user.shopName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-warning">Pending Review</span></span>
        </div>
      </div>
      <div class="alert-box">
        <p>📋 Please visit our office with your Citizenship card, PAN certificate, and business registration document for verification.</p>
      </div>
      <div class="info-box">
        <p style="font-size:13px;color:#374151;margin:0;">
          <strong>📍 NepShop Office</strong><br>
          Kathmandu, Bagmati Province, Nepal<br>
          Office hours: Sun – Fri, 10:00 AM – 5:00 PM
        </p>
      </div>
      <p style="font-size:13px;color:#6b7280;">You will receive an email once your account is reviewed by our team.</p>
    </div>
  `,
});

// ── 3. Delivery agent application submitted ───────────────
const sendDeliveryApplicationEmail = (user) => sendEmail({
  to:      user.email,
  subject: 'Your NepShop Delivery Agent Application has been received',
  html: `
    <div class="body">
      <h2 class="title">Application Received! ⏳</h2>
      <p class="subtitle">Thank you for applying as a delivery agent on NepShop.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Vehicle</span>
          <span class="info-value">${user.vehicleType}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-warning">Pending Review</span></span>
        </div>
      </div>
      <div class="alert-box">
        <p>📋 Please visit our office with your Citizenship card, Driving license, and Vehicle registration (bluebook).</p>
      </div>
      <p style="font-size:13px;color:#6b7280;">You will receive an email once your account is approved.</p>
    </div>
  `,
});

// ── 4. Account approved ───────────────────────────────────
const sendAccountApprovedEmail = (user) => sendEmail({
  to:      user.email,
  subject: `🎉 Your NepShop ${user.role === 'seller' ? 'Seller' : 'Delivery Agent'} account is approved!`,
  html: `
    <div class="body">
      <h2 class="title">Account Approved! 🎉</h2>
      <p class="subtitle">
        Congratulations ${user.firstName}! Your ${user.role === 'seller' ? 'seller' : 'delivery agent'} account has been approved.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Name</span>
          <span class="info-value">${user.firstName} ${user.lastName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Role</span>
          <span class="info-value">${user.role === 'seller' ? 'Seller' : 'Delivery Agent'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-success">Active</span></span>
        </div>
      </div>
      <p style="font-size:14px;color:#374151;">
        ${user.role === 'seller'
          ? 'You can now log in to your seller dashboard and start listing products.'
          : 'You can now log in to your delivery dashboard and start accepting deliveries.'}
      </p>
      <a href="http://localhost:5173/login" class="btn">
        ${user.role === 'seller' ? 'Go to Seller Dashboard →' : 'Go to Delivery Dashboard →'}
      </a>
    </div>
  `,
});

// ── 5. Account rejected ───────────────────────────────────
const sendAccountRejectedEmail = (user) => sendEmail({
  to:      user.email,
  subject: 'Update on your NepShop application',
  html: `
    <div class="body">
      <h2 class="title">Application Update</h2>
      <p class="subtitle">We regret to inform you that your application was not approved at this time.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Applicant</span>
          <span class="info-value">${user.firstName} ${user.lastName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-danger">Rejected</span></span>
        </div>
      </div>
      <div class="alert-box">
        <p>You may reapply after addressing any document issues. Please visit our office for more information.</p>
      </div>
      <p style="font-size:13px;color:#6b7280;">
        If you believe this is a mistake, please contact us at support@nepshop.com
      </p>
    </div>
  `,
});

// ── 6. Password reset ─────────────────────────────────────
const sendPasswordResetEmail = (user, resetUrl) => sendEmail({
  to:      user.email,
  subject: 'NepShop — Password Reset Request',
  html: `
    <div class="body">
      <h2 class="title">Reset Your Password 🔐</h2>
      <p class="subtitle">We received a request to reset your password.</p>
      <p style="font-size:14px;color:#374151;">
        Click the button below to reset your password. This link is valid for <strong>15 minutes</strong>.
      </p>
      <a href="${resetUrl}" class="btn">Reset Password →</a>
      <div class="divider"></div>
      <div class="alert-box">
        <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
      <p style="font-size:12px;color:#9ca3af;">
        Or copy this link: ${resetUrl}
      </p>
    </div>
  `,
});

// ── 7. Order placed (customer) ────────────────────────────
const sendOrderPlacedEmail = (user, order) => sendEmail({
  to:      user.email,
  subject: `NepShop — Order #${order._id.toString().slice(-8).toUpperCase()} Confirmed`,
  html: `
    <div class="body">
      <h2 class="title">Order Placed Successfully! 🎉</h2>
      <p class="subtitle">Thank you for your order, ${user.firstName}.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Order ID</span>
          <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Payment</span>
          <span class="info-value">${order.paymentMethod.replace(/_/g, ' ')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total</span>
          <span class="info-value">Rs ${order.total.toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-warning">Pending</span></span>
        </div>
      </div>
      <p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Items Ordered:</p>
      <div class="info-box">
        ${order.items.map(item => `
          <div class="item-row">
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-qty">Qty: ${item.quantity}</div>
            </div>
            <div class="item-price">Rs ${(item.price * item.quantity).toLocaleString()}</div>
          </div>
        `).join('')}
      </div>
      <div class="info-box">
        <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Delivery Address:</p>
        <p style="font-size:13px;color:#374151;margin:0;">
          ${order.deliveryAddress.fullName}<br>
          ${order.deliveryAddress.street}, ${order.deliveryAddress.city}<br>
          ${order.deliveryAddress.district}<br>
          📞 ${order.deliveryAddress.phone}
        </p>
      </div>
      <a href="http://localhost:5173/customer/dashboard" class="btn">Track Order →</a>
    </div>
  `,
});

// ── 8. Order status update (customer) ────────────────────
const sendOrderStatusEmail = (user, order, status) => {
  const statusConfig = {
    confirmed: {
      title:   'Order Confirmed! ✅',
      subtitle: 'Your order has been confirmed by the seller.',
      badge:   'badge-info',
      label:   'Confirmed',
      message: 'The seller is now preparing your order for dispatch.',
    },
    packed: {
      title:   'Order Packed! 📦',
      subtitle: 'Your order has been packed and is ready for pickup.',
      badge:   'badge-purple',
      label:   'Packed',
      message: 'A delivery agent will pick up your order soon.',
    },
    dispatched: {
      title:   'Order On the Way! 🚚',
      subtitle: 'Your order has been picked up and is on the way.',
      badge:   'badge-purple',
      label:   'Dispatched',
      message: 'Your delivery agent is heading to your address.',
    },
    delivered: {
      title:   'Order Delivered! 🎉',
      subtitle: 'Your order has been delivered successfully.',
      badge:   'badge-success',
      label:   'Delivered',
      message: 'We hope you enjoy your purchase! Please leave a review.',
    },
    cancelled: {
      title:   'Order Cancelled',
      subtitle: 'Your order has been cancelled.',
      badge:   'badge-danger',
      label:   'Cancelled',
      message: 'If you paid online, a refund will be processed within 3-5 business days.',
    },
  };

  const config = statusConfig[status];
  if (!config) return;

  return sendEmail({
    to:      user.email,
    subject: `NepShop — Order #${order._id.toString().slice(-8).toUpperCase()} ${config.label}`,
    html: `
      <div class="body">
        <h2 class="title">${config.title}</h2>
        <p class="subtitle">${config.subtitle}</p>
        <div class="info-box">
          <div class="info-row">
            <span class="info-label">Order ID</span>
            <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value">
              <span class="status-badge ${config.badge}">${config.label}</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Total</span>
            <span class="info-value">Rs ${order.total.toLocaleString()}</span>
          </div>
        </div>
        <p style="font-size:14px;color:#374151;">${config.message}</p>
        <a href="http://localhost:5173/customer/dashboard" class="btn">View Order →</a>
      </div>
    `,
  });
};

// ── 9. New order alert (seller) ───────────────────────────
const sendNewOrderToSeller = (seller, order) => sendEmail({
  to:      seller.email,
  subject: `NepShop — New Order #${order._id.toString().slice(-8).toUpperCase()} received!`,
  html: `
    <div class="body">
      <h2 class="title">New Order Received! 🛍️</h2>
      <p class="subtitle">A customer has placed an order for your products.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Order ID</span>
          <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total</span>
          <span class="info-value">Rs ${order.total.toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Your Earnings</span>
          <span class="info-value">Rs ${(order.total - order.commissionAmount).toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Payment</span>
          <span class="info-value">${order.paymentMethod.replace(/_/g, ' ')}</span>
        </div>
      </div>
      <p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Items:</p>
      <div class="info-box">
        ${order.items.map(item => `
          <div class="item-row">
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-qty">Qty: ${item.quantity}</div>
            </div>
            <div class="item-price">Rs ${(item.price * item.quantity).toLocaleString()}</div>
          </div>
        `).join('')}
      </div>
      <div class="info-box">
        <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Deliver to:</p>
        <p style="font-size:13px;color:#374151;margin:0;">
          ${order.deliveryAddress.fullName}<br>
          ${order.deliveryAddress.street}, ${order.deliveryAddress.city}<br>
          📞 ${order.deliveryAddress.phone}
        </p>
      </div>
      <a href="http://localhost:5173/seller/dashboard" class="btn">Process Order →</a>
    </div>
  `,
});

// ── 10. New delivery assigned (delivery agent) ────────────
const sendDeliveryAssignedEmail = (agent, order) => sendEmail({
  to:      agent.email,
  subject: `NepShop — New Delivery Assignment #${order._id.toString().slice(-8).toUpperCase()}`,
  html: `
    <div class="body">
      <h2 class="title">New Delivery Assigned! 🚚</h2>
      <p class="subtitle">You have been assigned a new delivery order.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Order ID</span>
          <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Your Earning</span>
          <span class="info-value">Rs ${order.deliveryEarning || 50}</span>
        </div>
      </div>
      <div class="info-box">
        <p style="font-size:13px;font-weight:600;color:#1e40af;margin:0 0 8px;">📦 Pickup From:</p>
        <p style="font-size:13px;color:#374151;margin:0;">
          ${order.pickupAddress?.shopName || 'Seller Shop'}<br>
          ${order.pickupAddress?.street || ''}, ${order.pickupAddress?.city || ''}<br>
          📞 ${order.pickupAddress?.phone || 'Contact seller'}
        </p>
      </div>
      <div class="info-box">
        <p style="font-size:13px;font-weight:600;color:#065f46;margin:0 0 8px;">📍 Deliver To:</p>
        <p style="font-size:13px;color:#374151;margin:0;">
          ${order.deliveryAddress.fullName}<br>
          ${order.deliveryAddress.street}, ${order.deliveryAddress.city}<br>
          ${order.deliveryAddress.district}<br>
          📞 ${order.deliveryAddress.phone}
        </p>
      </div>
      <a href="http://localhost:5173/login" class="btn">View in Dashboard →</a>
    </div>
  `,
});

// ── 11. New seller application alert (admin) ──────────────
const sendNewApplicationToAdmin = (adminEmail, user) => sendEmail({
  to:      adminEmail,
  subject: `NepShop — New ${user.role === 'seller' ? 'Seller' : 'Delivery Agent'} Application`,
  html: `
    <div class="body">
      <h2 class="title">New Application Received 📋</h2>
      <p class="subtitle">A new ${user.role === 'seller' ? 'seller' : 'delivery agent'} has applied and needs your review.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Name</span>
          <span class="info-value">${user.firstName} ${user.lastName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${user.email}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Phone</span>
          <span class="info-value">${user.phone}</span>
        </div>
        ${user.role === 'seller' ? `
        <div class="info-row">
          <span class="info-label">Shop Name</span>
          <span class="info-value">${user.shopName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">PAN Number</span>
          <span class="info-value">${user.panNumber}</span>
        </div>
        ` : `
        <div class="info-row">
          <span class="info-label">Vehicle</span>
          <span class="info-value">${user.vehicleType}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Citizenship No.</span>
          <span class="info-value">${user.citizenshipNumber}</span>
        </div>
        `}
      </div>
      <a href="http://localhost:5173/admin/login" class="btn">Review Application →</a>
    </div>
  `,
});

// ── 12. Low stock alert (seller) ─────────────────────────
const sendLowStockEmail = (seller, product) => sendEmail({
  to:      seller.email,
  subject: `⚠️ NepShop — Low Stock Alert: ${product.name}`,
  html: `
    <div class="body">
      <h2 class="title">Low Stock Alert ⚠️</h2>
      <p class="subtitle">One of your products is running low on stock.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Product</span>
          <span class="info-value">${product.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Category</span>
          <span class="info-value">${product.category}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Remaining Stock</span>
          <span class="info-value" style="color:#dc2626;font-weight:700;">${product.stock} units</span>
        </div>
      </div>
      <div class="alert-box">
        <p>Please restock this product soon to avoid missing orders.</p>
      </div>
      <a href="http://localhost:5173/seller/dashboard" class="btn">Update Stock →</a>
    </div>
  `,
});

// ── 13. Order cancelled alert (seller) ───────────────────
const sendOrderCancelledToSeller = (seller, order) => sendEmail({
  to:      seller.email,
  subject: `NepShop — Order #${order._id.toString().slice(-8).toUpperCase()} Cancelled`,
  html: `
    <div class="body">
      <h2 class="title">Order Cancelled ❌</h2>
      <p class="subtitle">A customer has cancelled their order.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Order ID</span>
          <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total</span>
          <span class="info-value">Rs ${order.total.toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="status-badge badge-danger">Cancelled</span></span>
        </div>
      </div>
      <p style="font-size:13px;color:#374151;">
        Stock for all items in this order has been automatically restored.
      </p>
      <a href="http://localhost:5173/seller/dashboard" class="btn">View Orders →</a>
    </div>
  `,
});

// ── 14. Order delivered alert (seller) ───────────────────
const sendOrderDeliveredToSeller = (seller, order) => sendEmail({
  to:      seller.email,
  subject: `NepShop — Order #${order._id.toString().slice(-8).toUpperCase()} Delivered ✅`,
  html: `
    <div class="body">
      <h2 class="title">Order Delivered! 🎉</h2>
      <p class="subtitle">Great news! An order has been successfully delivered to your customer.</p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Order ID</span>
          <span class="info-value">#${order._id.toString().slice(-8).toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total</span>
          <span class="info-value">Rs ${order.total.toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Your Earnings</span>
          <span class="info-value" style="color:#065f46;font-weight:700;">
            Rs ${(order.total - order.commissionAmount).toLocaleString()}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value">
            <span class="status-badge badge-success">Delivered</span>
          </span>
        </div>
      </div>
      <p style="font-size:13px;color:#374151;">
        Your earnings have been credited to your account after platform commission deduction.
      </p>
      <a href="http://localhost:5173/login" class="btn">View Earnings →</a>
    </div>
  `,
});

module.exports = {
  sendWelcomeEmail,
  sendSellerApplicationEmail,
  sendDeliveryApplicationEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendPasswordResetEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  sendNewOrderToSeller,
  sendDeliveryAssignedEmail,
  sendNewApplicationToAdmin,
  sendLowStockEmail,
  sendOrderCancelledToSeller,
  sendOrderDeliveredToSeller,
};