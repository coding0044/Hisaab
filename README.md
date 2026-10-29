# Shared Balance

## WhatsApp reminders and repayment notifications

Debt reminders use WhatsApp Click to Chat with the current outstanding amount. Opening the link
only pre-fills the message; the user must review and press **Send** in WhatsApp.

The `0001_whatsapp_notifications.sql` migration adds the initial contact numbers to the existing
Faraz Ahmed and Mir Hassan profiles, allows a signed-in user to update only their own WhatsApp
contact/consent fields, and creates a private notification-attempt log. Apply it to the existing
Supabase database before deploying the updated app (from this repository, run `npx drizzle-kit migrate`
with `LOVABLE_DB_MIGRATION_URL` configured in a trusted server/terminal environment). The migration
requests a PostgREST schema-cache reload at the end. Recipients must explicitly opt in under
**Settings → WhatsApp contact** before automatic notifications are sent.

Automatic repayment notifications use the official WhatsApp Business Platform Cloud API from the
`whatsapp-notification` Supabase Edge Function. Deploy the function and configure these server-side
Supabase function secrets (never add them to `VITE_*` variables or frontend code):

- `WHATSAPP_API_VERSION` (for example, the Graph API version enabled for your Business account)
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE` (for example, `en`)
- `APP_URL` (the public URL of this application)

The selected approved template must have five body placeholders, in order: payer name, amount,
payee name, payment method, and app URL. For example:

> Payment Notification: {{1}} has submitted a repayment request of PKR {{2}} to {{3}}. Payment
> method: {{4}}. Status: Awaiting Confirmation. Please open the application to review the request
> and confirm receipt: {{5}}

Set up the WhatsApp Business sender, verify the recipients, obtain their explicit WhatsApp opt-in,
and submit/approve the template with Meta before enabling sends. A response accepted by the Cloud
API is reported as **accepted**, not delivered; delivery requires provider confirmation. Failed
attempts are logged and can be retried without resending an accepted notification. Uncertain API
outcomes are not automatically retried because that could create duplicate messages. If the API
is missing or unavailable, the repayment remains saved and awaiting confirmation, and the submitter
gets a manual WhatsApp fallback.

Complete Two-Person Loan & Expense Tracking Website

Build a complete, secure, production-ready web application for two friends, Faraz Ahmed and Mir Hassan, to manage shared expenses, personal loans, cash repayments, payment proofs, and outstanding balances.

First, inspect the existing project and preserve its current design and working functionality. Implement the complete frontend, backend, database, authentication, and financial settlement workflows. Do not create a frontend-only demo or use mock data.

1. Two Authorized User Accounts

Configure exactly two authorized users.

Account 1: Faraz Ahmed

- Email: faraz.maju@gmail.com
- Password: Use the initial password supplied by the project owner and configure it securely through the authentication system.
- Display name: Faraz Ahmed.

Account 2: Mir Hassan

- Email: mirhassan@gmail.com
- Password: Use the initial password supplied by the project owner and configure it securely through the authentication system.
- Display name: Mir Hassan.

Authentication requirements:

- Create working email-and-password login.
- Allow both users to log in independently.
- Restrict access to these two authorized accounts.
- Hash passwords using the authentication provider's secure password management.
- Never expose passwords in frontend code, database records, logs, or public environment variables.
- Provide logout and protected routes.
- Allow users to change their passwords securely.
- Do not create public registration or unauthorized accounts.

Use the existing authentication provider if one is already configured. Otherwise, implement a suitable secure authentication system.

2. Shared Dashboard

Create a dashboard that displays:

- Total money Faraz owes Mir Hassan.
- Total money Mir Hassan owes Faraz.
- Net balance between both friends.
- Total pending debts.
- Payments awaiting confirmation.
- Total confirmed repayments.
- Recent transactions.
- Monthly expense summary.

Use PKR as the currency throughout the application.

Display the logged-in user's name and a clear financial summary.

3. Add Expense or Loan

Provide an Add Transaction form containing:

- Paid by: Faraz Ahmed or Mir Hassan.
- Owed by: the other friend.
- Amount in PKR.
- Transaction date.
- Description or reason.
- Payment category.
- Optional receipt or screenshot.
- Submit button.

Example: Faraz pays Rs. 100 on behalf of Mir Hassan.

Expected result:

- Faraz's receivable increases by Rs. 100.
- Mir Hassan's payable increases by Rs. 100.
- Transaction status is Pending.
- Both users can see the transaction.

Apply the same logic in reverse when Mir Hassan pays for Faraz.

Prevent invalid amounts, duplicate submissions, and unauthorized modifications.

4. Cash Repayment and Confirmation

Implement the complete repayment workflow.

Example:

1. Faraz records an expense of Rs. 100 for Mir Hassan.
2. Mir Hassan logs in and sees that he owes Faraz Rs. 100.
3. Mir Hassan selects “Return Money.”
4. He enters Rs. 100 and chooses Cash or Bank Transfer.
5. He can upload a screenshot or receipt as proof.
6. The repayment status becomes Awaiting Confirmation.
7. Faraz receives an in-app notification.
8. Faraz reviews the repayment and selects Confirm Received or Reject.
9. Only after confirmation does the outstanding debt decrease.
10. Both dashboards update immediately.
11. Both users retain access to the complete transaction history.

Important: Uploading proof or submitting a repayment must never automatically mark the debt as paid.

5. Partial Repayments

Support multiple repayments against the same debt.

Example:

- Original debt: Rs. 1,000.
- Mir Hassan returns Rs. 400.
- Faraz confirms receipt.
- Remaining debt: Rs. 600.
- Mir Hassan returns Rs. 600 later.
- Faraz confirms receipt.
- Remaining debt: Rs. 0.

Preserve the original debt and every repayment record. Never delete financial history to settle a transaction.

6. Transaction History

Create a detailed transaction history with:

- Transaction ID.
- Date and time.
- Paid by.
- Owed by.
- Original amount.
- Amount repaid.
- Outstanding amount.
- Payment method.
- Description.
- Receipt or proof.
- Current status.

Add search, date filters, status filters, transaction details, and receipt previews.

Allow users to export transaction history as CSV or PDF.

7. Correct Balance Calculations

Calculate all balances from actual database transactions.

Rules:

- Faraz pays for Mir Hassan → Mir Hassan owes Faraz.
- Mir Hassan pays for Faraz → Faraz owes Mir Hassan.
- Pending repayments do not reduce confirmed debt.
- Confirmed repayments reduce the corresponding debt.
- Rejected repayments do not reduce debt.
- Prevent duplicate confirmations and double counting.
- Handle partial repayments correctly.

Example:

- Faraz owes Mir Hassan Rs. 200.
- Mir Hassan owes Faraz Rs. 500.
- Net result: Mir Hassan owes Faraz Rs. 300.

Display both individual debts and the net balance clearly.

8. Database and Backend

Use the project's existing compatible stack. If starting from scratch, use:

- Next.js or React with TypeScript.
- Tailwind CSS for styling.
- Supabase PostgreSQL for persistent data and authentication, or a suitable existing alternative.
- Secure server-side APIs.
- Private file storage for payment proofs.

Create database tables for:

- Authorized users.
- Transactions.
- Repayments.
- Payment proofs.
- Notifications.
- Audit logs.

Enforce server-side authorization and database access policies so only the two authorized users can access their shared financial records.

Never trust client-side balance calculations. Validate and calculate financial changes on the server or through secure database operations.

Use atomic operations to prevent race conditions and duplicate settlements.

9. UI Design

Create a premium, modern fintech dashboard featuring:

- Navy, blue, and green colors.
- Responsive mobile-first layout.
- Dark and light themes.
- Summary cards.
- Clear debt and repayment indicators.
- Attractive transaction tables.
- Easy-to-use forms.
- Payment proof previews.
- Confirmation dialogs.
- Notifications and loading states.
- Helpful empty states and error messages.

Keep the interface simple and fast for daily use by two friends.

10. Security

- Never hardcode passwords into the frontend.
- Store credentials only through secure authentication.
- Restrict access to the two authorized email addresses.
- Protect every API route and database operation.
- Validate transaction ownership and repayment amounts on the server.
- Store uploaded receipts privately.
- Prevent unauthorized changes to confirmed transactions.
- Maintain an audit trail for financial actions.
- Never expose service-role keys or secret environment variables in client code.

11. Final Testing

Test the entire workflow using both real authorized accounts:

1. Faraz logs in with his email and configured password.
2. Mir Hassan logs in with his email and configured password.
3. Faraz records Rs. 100 paid for Mir Hassan.
4. Mir Hassan sees an outstanding debt of Rs. 100.
5. Mir Hassan submits a Rs. 100 cash repayment with optional proof.
6. Faraz confirms receiving the money.
7. Both dashboards show the settled balance of Rs. 0.
8. The original transaction and repayment remain visible in history.
9. Test partial repayments, rejected repayments, and repayments in the opposite direction.
10. Verify that unauthorized users cannot access the application or its data.

Complete the actual implementation, connect the database, configure authentication, fix all errors, and ensure all buttons, forms, dashboards, and workflows work correctly. Do not stop after creating the UI.
