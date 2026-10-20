# RASLASH App authentication email

Current status on 2026-10-09: the owner completed the private Resend key entry
and saved custom SMTP. A separate freshly loaded Supabase settings tab confirms
custom SMTP is enabled, host `smtp.resend.com`, port 465, sender name `RASLASH App`,
and the stored password is hidden. One explicitly authorized test email to the
existing `info@protrom.com` account was accepted by Supabase (HTTP 200), marked
`Delivered` by Resend, and confirmed received by the owner. Physical-device
magic-link login and inbox SPF/DKIM headers are not yet verified; see the test
result below. No SMTP secret was read or stored.

Historical status on 2026-09-19: setup requested and Resend signup opened for the owner.
No SMTP provider is currently configured in the production Supabase project
`acvplymfplzbwhfeypfw`. Custom SMTP remains **disabled** until verification and
a successful delivery test. No passwords or API keys belong in this document.

Read-only public DNS check on 2026-09-19 returned `ns33.domaincontrol.com` and
`ns34.domaincontrol.com` for `protrom.com`. No DNS records were modified.

## Proposed configuration

- Provider: Resend, initially on its free plan; no paid subscription authorized.
- Sender display name: `RASLASH App`.
- Dedicated sending domain: `auth.protrom.com` (pending DNS access/verification).
- Proposed sender: `no-reply@auth.protrom.com`.
- SMTP host: `smtp.resend.com`; port: `465`; username: `resend`.
- SMTP password: a dedicated Resend sending key, entered only into Supabase's
  server-side SMTP configuration. Never put it in an `EXPO_PUBLIC_*` variable,
  mobile app bundle, repository, release notes or chat.

## Historical setup checklist (current outcome below)

1. Owner completes the Resend account signup and confirms the DNS provider for
   `protrom.com`. Do not accept service terms or choose a paid plan on their behalf.
2. Add `auth.protrom.com` in Resend. Use the exact generated SPF/DKIM records;
   do not invent verification values. Verify the sending domain before cutover.
3. Preserve the existing root domain MX records and company mailbox service.
   Do not enable inbound receiving or replace existing SPF records blindly.
   Review inherited DMARC policy before adding a subdomain-specific record.
4. Create a least-privilege, sending-only key restricted to the verified domain.
   Obtain action-time approval for creating the persistent credential.
5. Save sender and SMTP settings in Supabase after domain verification. Keep
   link/open tracking off for authentication emails. Preserve the existing
   redirect URLs, token placeholders, auth providers and session policies.
6. Send an authorized test authentication email. Verify visible sender name,
   SPF/DKIM authentication, delivery to the intended inbox, and the actual
   app login/verification flow before treating the cutover as complete.
7. Check Supabase auth rate limits and Resend usage alerts. The Resend free
   plan currently lists 3,000 emails/month and 100/day; these are limits, not
   a guarantee of capacity for a public launch. Do not enable paid overages
   without separate approval.

An SMTP failure must not be hidden by saying only that the sender was renamed.
Record the exact delivery/login test outcome here after setup.

## Magic-link implementation — 2026-10-07

- Added an optional email-link sign-in screen. Password, Apple and Google remain
  available. A sign-in link does not silently register an unknown email address.
- Supabase remains the identity/session provider. Resend only transports mail.
- Production redirect: `raslash://auth/email-callback` (exact match). Preserve
  the existing Google redirect `raslash://auth/callback`.
- The shared client now uses PKCE with a persistent verifier and Expo secure
  randomness/SHA-256 on native. Open the latest link on the device that requested
  it. Old links or links opened on another device show a new-link action.
- Signup confirmation also uses this callback. Successful sign-in waits for the
  existing profile before routing; it does not reset onboarding.
- Duplicate taps/links are guarded; auth secrets are scrubbed from crash messages.
- Keep the Supabase `{{ .ConfirmationURL }}` placeholder in confirmation and
  magic-link mail templates. Do not substitute a bare OTP or interpolate a
  custom scheme into an unsafe template URL. Keep Resend link tracking off.
- Read-only live check: Supabase had only `raslash://auth/callback` allowed;
  Site URL was still `http://localhost:3000`. Owner approved the exact email
  redirect addition; it was saved and the UI now lists both routes. A branded
  HTTPS fallback should be agreed before changing
  Site URL; this implementation always supplies its explicit app redirect.
- Owner opened the existing `protrom` Resend workspace. `whaleharry.com` is
  verified there; it must not be removed, repurposed or reconfigured for RASLASH.
  Owner approved separate `auth.protrom.com` registration. Created domain ID
  `2496553f-17c1-4285-934b-092cfe5b87f6`, Tokyo region. Owner approved the three
  new GoDaddy records; they were saved (18 → 21 total records), resolved in
  public DNS, and Resend now reports `verified`. Existing Google Workspace
  MX/SPF/DKIM/DMARC and website records were preserved. No paid plan was purchased.
- No SMTP cutover, real email delivery or physical-device
  magic-link login has been completed. No new EAS build or OTA has been sent.

### DNS records shown by Resend on 2026-10-07

GoDaddy host names are relative to `protrom.com`. Add only these records after
checking there are no conflicting records. Do not edit root MX/SPF/DMARC or
Whale Harry records. Receiving is disabled. Values below are public DNS values,
not the private SMTP/API credential.

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.auth` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4VmD68t0aRE3ASg40vOL/22D99shweez+n0MMertuK0EJ50o5fWLNa9eNsCiRPn1ZZZqCyVhi+yLCCw44wekFGP3YW/o6ZGKKpuo1HsQkO3eBesdFjwIE2AdjN7LGIriyAGOtaO+wbzzcI3GxEipm0ZM3HhVhkzbdUMQLVvZCIQIDAQAB` | Auto |
| CNAME | `rsend.auth` | `rsend-apne1.forge.rmta.net` | Auto |
| CNAME | `send.auth` | `send.forge.rmta.net` | Auto |

Production gates: completed DNS verification → domain-scoped sending key →
server-side Supabase SMTP cutover → authorized delivery test → real-device
latest-link, expired-link, cold/warm launch and returning-member tests.

Local verification: 77 automated tests, TypeScript, and iOS/Android Hermes
exports passed. These do not prove real mail delivery or physical deep linking.

Historical handoff, before the SMTP cutover: Resend's Add API Key form is prepared with name `RASLASH Auth SMTP`,
permission `Sending access`, domain `auth.protrom.com`. No key has been created.
Owner must create/copy the key privately, paste it into the prepared Supabase
SMTP Password field, and complete the save. Sender/host/user fields are prepared;
port is 465 and minimum interval is 60 seconds. Custom SMTP is not yet saved or
active in production. Never read, screenshot, paste into chat or commit the key.

## SMTP cutover and branded templates — 2026-10-09

- The owner privately created the key and saved SMTP. The Resend key list shows
  `RASLASH Auth SMTP` with `Sending access`. Its plaintext reveal dialog was
  closed without reading or copying the credential. The existing original SMTP
  tab was not reloaded, so the owner's form contents were not discarded.
- Saved and previewed the two primary auth templates in the production
  Supabase dashboard:
  - Magic link subject: `RASLASH App — Giriş bağlantın`.
  - Confirmation subject: `RASLASH App — E-postanı doğrula`.
  - Source copies: `supabase/templates/magic-link.html` and
    `supabase/templates/confirm-sign-up.html`.
- Both templates contain exactly one `{{ .ConfirmationURL }}` link, Turkish
  copy, same-requesting-device instructions, and a warning not to share the
  one-use link. No user-supplied metadata, trackers, external images or marketing
  links were added. Other templates and security-notification switches remain
  unchanged. No authentication/security policy was disabled.
- Owner authorized a single delivery test to their Gmail address. The public
  Supabase client requested a magic link with `shouldCreateUser: false` and the
  explicit app redirect. Supabase returned HTTP 422 / `otp_disabled` **before
  sending an email**. The complete dashboard list had 13 users; the requested
  address was not present. Supabase Auth's OTP handler/test documents this
  rejection when creating an unknown user is prohibited. Do not enable implicit
  signup or silently create an account to make a smoke test pass.
- The owner explicitly approved one test email to the existing
  `info@protrom.com` account. The public client used `shouldCreateUser: false`,
  PKCE, and the exact app redirect; Supabase returned HTTP 200 with no error.
  Resend's filtered Emails list showed `Delivered`, recipient
  `info@protrom.com`, and subject `RASLASH App — Giriş bağlantın`. The owner then
  confirmed the mail arrived. No second email was sent and no user was created.
  The message body/auth link was not opened, copied, logged or screenshotted.
  Safe provider-list evidence: `/tmp/raslash-auth-delivery-20261009.png`.
- This was SMTP/inbox delivery QA only. Its PKCE verifier belonged to the
  ephemeral smoke-test client and was not persisted, so this link is not a
  phone-login test. The installed build must request its own latest link on the
  same device. Physical cold/warm launch, expired-link, returning-user login,
  sender display name and SPF/DKIM header checks remain gates. No provider
  status is being treated as proof of successful app authentication.
- Local template checks passed: one confirmation placeholder/link per template,
  Turkish language, no scripts, frames, remote images or extra token variables.
  This turn did not change mobile application code, publish an OTA, build or
  submit a store release. The latest magic-link application code still needs
  an installed test build and cold/warm-link, expired-link and returning-user QA.

### Device-test builds requested — 2026-10-09

After delivery confirmation the owner requested continuation. The full 77-test
suite, TypeScript, diff checks and both Metro/Hermes exports passed again.
Device-test builds were requested with existing signing credentials preserved:

- iOS 1.0.3 (28), EAS `af97013e-ed74-4cc5-bb7f-0d5622a8a96a`, with Apple
  binary upload `bfc20bc4-4ee9-4c26-9205-7919fce2081f` scheduled for TestFlight.
- Android preview APK 1.0.3 (20), EAS
  `11dede8c-eb31-4d67-9f83-f0671dddae4c`. The first local request timed out
  during optional fingerprinting before build creation; one supported retry
  skipped that metadata step. No duplicate build 19 was created.

The iOS build and Apple binary upload both finished. A separate App Store
Connect check confirms build 28 is `VALID` and `IN_BETA_TESTING` internally;
the owner has been asked to perform same-phone login QA. Android completion
and the physical-device test outcome are still pending. No store
review submission, Google Play upload, production OTA or public release was
made. The installed device must request its own latest link from the login
screen's **E-posta bağlantısıyla giriş** action. Full test steps and build
outcomes are tracked in `docs/release-readiness-2026-09-29.md`.

## Sources checked

- https://supabase.com/docs/guides/auth/auth-smtp
- https://resend.com/docs/send-with-supabase-smtp
- https://resend.com/pricing
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://github.com/supabase/auth/blob/master/internal/api/otp.go
- https://github.com/supabase/auth/blob/master/internal/api/otp_test.go
