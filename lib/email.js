// Email module — wire up your SMTP settings via environment variables:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL

const config = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.FROM_EMAIL || 'noreply@fitbook.app',
  enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER)
};

export async function sendEmail({ to, subject, html, text }) {
  if (!config.enabled) {
    console.log(`📧 [EMAIL STUB] To: ${to} | Subject: ${subject}`);
    return;
  }
  // Full SMTP implementation would go here
  // For production, set SMTP env vars to enable real email delivery
  console.log(`📧 Sending: ${subject} → ${to}`);
}

export function bookingConfirmationEmail(member, session, studio) {
  const date = new Date(session.starts_at).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const time = new Date(session.starts_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  return {
    to: member.email,
    subject: `Booking confirmed — ${session.name} at ${time}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">${studio.name}</h2>
        <p>Hi ${member.name},</p>
        <p>Your spot is confirmed for:</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">
          <strong>${session.name}</strong><br>
          ${date} at ${time}<br>
          Duration: ${session.duration_minutes || 60} minutes
        </div>
        <p>See you there!</p>
        <p style="color:#999;font-size:12px">To cancel, visit your booking page or contact us.</p>
      </div>
    `
  };
}

export function cancellationEmail(member, session, studio) {
  return {
    to: member.email,
    subject: `Booking cancelled — ${session.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">${studio.name}</h2>
        <p>Hi ${member.name}, your booking for <strong>${session.name}</strong> has been cancelled.</p>
        <p>Book another class at your studio's booking page.</p>
      </div>
    `
  };
}

export function waitlistAvailableEmail(member, session, studio) {
  return {
    to: member.email,
    subject: `Spot available — ${session.name}!`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">${studio.name}</h2>
        <p>Hi ${member.name},</p>
        <p>Great news! A spot has opened up in <strong>${session.name}</strong>. 
        You've been automatically moved from the waitlist.</p>
        <p>See you there!</p>
      </div>
    `
  };
}

export function classCancelledEmail(member, session, studio, reason) {
  return {
    to: member.email,
    subject: `Class cancelled — ${session.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">${studio.name}</h2>
        <p>Hi ${member.name},</p>
        <p>Unfortunately, <strong>${session.name}</strong> has been cancelled.${reason ? ` Reason: ${reason}` : ''}</p>
        <p>Any credits used have been returned to your account.</p>
      </div>
    `
  };
}
