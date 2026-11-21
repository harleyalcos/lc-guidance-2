use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, Message, SmtpTransport,
    Transport,
};

fn mailer(smtp_email: &str, smtp_password: &str) -> Result<SmtpTransport, String> {
    let credentials = Credentials::new(smtp_email.to_string(), smtp_password.to_string());
    SmtpTransport::starttls_relay("smtp.gmail.com")
        .map_err(|_| "Could not connect to Gmail SMTP".to_string())
        .map(|builder| {
            builder
                .credentials(credentials)
                .timeout(Some(std::time::Duration::from_secs(20)))
                .build()
        })
}

/// Explain an SMTP failure in terms the counselor can act on.
fn describe_smtp_error(error: &lettre::transport::smtp::Error, action: &str) -> String {
    let detail = error.to_string();
    let lower = detail.to_lowercase();
    if lower.contains("535")
        || lower.contains("534")
        || lower.contains("authentication")
        || lower.contains("username and password not accepted")
        || lower.contains("badcredentials")
    {
        format!("Could not {action}: Gmail rejected the sign-in. Check the Gmail address and use a 16-character Gmail App Password (2-Step Verification must be on).")
    } else if error.is_timeout()
        || lower.contains("timed out")
        || lower.contains("connection")
        || lower.contains("dns")
        || lower.contains("resolve")
        || lower.contains("network")
    {
        format!("Could not {action}: the Gmail server could not be reached. Check the internet connection (or school firewall) and try again.")
    } else if error.is_transient() {
        format!("Could not {action}: Gmail is temporarily unavailable. Wait a few minutes and try again.")
    } else if lower.contains("550") || lower.contains("553") || lower.contains("recipient") {
        format!("Could not {action}: the recipient address was rejected. Check the recovery email address.")
    } else {
        format!("Could not {action}. Check the Gmail address and App Password. ({detail})")
    }
}

fn parse_mailbox(email: &str, label: &str) -> Result<Mailbox, String> {
    email
        .parse::<Mailbox>()
        .map_err(|_| format!("{label} email address is invalid"))
}

pub fn send_test_email(
    smtp_email: &str,
    smtp_password: &str,
    recovery_email: &str,
) -> Result<(), String> {
    let email = Message::builder()
        .from(parse_mailbox(smtp_email, "SMTP")?)
        .to(parse_mailbox(recovery_email, "Recovery")?)
        .subject("Laguna College Guidance Office - Test Email")
        .body("Your Laguna College Guidance Office email reset setup is working.".to_string())
        .map_err(|_| "Could not create test email".to_string())?;

    mailer(smtp_email, smtp_password)?
        .send(&email)
        .map_err(|error| describe_smtp_error(&error, "send the test email"))?;

    Ok(())
}

pub fn send_otp_email(
    smtp_email: &str,
    smtp_password: &str,
    recovery_email: &str,
    code: &str,
    purpose: &str,
) -> Result<(), String> {
    let (subject, description) = match purpose {
        "recovery_email_access" => (
            "Laguna College Guidance Office - Recovery Email Verification",
            "Your recovery email access code",
        ),
        "pin_change_access" => (
            "Laguna College Guidance Office - PIN Change Verification",
            "Your PIN change verification code",
        ),
        _ => (
            "Laguna College Guidance Office - PIN Reset Code",
            "Your PIN reset code",
        ),
    };
    let body = format!("{description} is: {code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.");

    let email = Message::builder()
        .from(parse_mailbox(smtp_email, "SMTP")?)
        .to(parse_mailbox(recovery_email, "Recovery")?)
        .subject(subject)
        .body(body)
        .map_err(|_| "Could not create reset email".to_string())?;

    mailer(smtp_email, smtp_password)?
        .send(&email)
        .map_err(|error| describe_smtp_error(&error, "send the verification email"))?;

    Ok(())
}

pub fn validate_address(address: &str) -> Result<(), String> {
    parse_mailbox(address, "Email").map(|_| ())
}
