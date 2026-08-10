# Email Deliverability

The application cannot force Gmail, Outlook, or Yahoo to place messages in the Primary inbox. Inbox placement is decided by the recipient mailbox provider. The backend now sends cleaner transactional messages from one domain-aligned sender, but the DNS and SendGrid account must also be configured.

## Required Production Environment Variables

Set these on Render:

```txt
SENDGRID_API_KEY=SG.xxxxxx
MAIL_FROM_EMAIL=notifications@mrrenaudinbarbershop.com
MAIL_FROM_NAME=Mr. Renaudin Barbershop
MAIL_REPLY_TO=mrrenaudinbarber@gmail.com
CONTACT_TO_EMAIL=mrrenaudinbarber@gmail.com
MAIL_UNSUBSCRIBE_EMAIL=mrrenaudinbarber@gmail.com
```

Keep `MAIL_FROM_EMAIL` on the `mrrenaudinbarbershop.com` domain. Do not use a Gmail address in the technical `From` header when sending through SendGrid.

## Required DNS / SendGrid Setup

1. In SendGrid, authenticate `mrrenaudinbarbershop.com`.
2. Publish the CNAME records SendGrid gives you for DKIM and return-path authentication.
3. Publish or update SPF so SendGrid is authorized.
4. Add a DMARC record such as:

```txt
_dmarc.mrrenaudinbarbershop.com TXT "v=DMARC1; p=none; rua=mailto:mrrenaudinbarber@gmail.com; adkim=s; aspf=s"
```

Start with `p=none` to monitor. Move to `quarantine` or `reject` only after confirming SPF/DKIM alignment.

## Current Public DNS Finding

On August 10, 2026, public DNS returned:

```txt
mrrenaudinbarbershop.com TXT "v=spf1 include:amazonses.com ~all"
_dmarc.mrrenaudinbarbershop.com TXT "v=DMARC1; p=none;"
s1._domainkey.mrrenaudinbarbershop.com CNAME missing
s2._domainkey.mrrenaudinbarbershop.com CNAME missing
```

That means the domain is currently authorizing Amazon SES, while this backend is configured for SendGrid. Authenticate the domain in SendGrid and publish the exact CNAME records SendGrid provides. If you keep a root SPF record, it must include every service that sends mail for the domain.

## Why This Matters

Mailbox providers look for SPF, DKIM, DMARC, aligned `From` domains, TLS, low spam complaints, and consistent sender identity. Code changes help, but DNS authentication is what proves that the website is allowed to send email for the domain.
