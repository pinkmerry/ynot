# Lucky Draw Production Project Plan

## 1. Product Summary

**Lucky Draw** is a mobile-first card draw web app for livestream selling. The first product focus is Pokemon and One Piece cards.

The business process:

1. Admin creates a draw round with a card series, price per draw, total envelope numbers, payment details, and livestream links.
2. Customer opens the site through LINE LIFF or a normal browser.
3. Customer logs in through LINE LIFF so we can verify identity.
4. Customer chooses how many draws they want and pays the correct amount first.
5. Customer uploads bank transfer or PromptPay slip.
6. Admin verifies payment.
7. After approval, customer can pick exactly the number of envelope slots they paid for.
8. During the livestream, the streamer picks the selected envelope numbers and opens them on camera.
9. Admin records the result and shipping/tracking later.

Example:

- Price per draw: 5,000 THB
- Customer pays: 20,000 THB
- System gives customer: 4 slot selections
- Customer can pick exactly 4 available envelope numbers

## 2. Confirmed Decisions

- This is for **real production**, not only a demo.
- Hosting target: **Vercel free tier** first.
- Database: **Supabase free tier is acceptable** if needed.
- Customer access: **LINE LIFF login required**.
- Customer can buy multiple draw chances in one order.
- Payment flow: **customer pays first, then picks numbers after admin approval**.
- No temporary unpaid slot reservation is needed for phase 1.
- Languages: **Thai and English**, user can toggle.
- Main livestream platform: **Facebook Live**.
- Easiest embedded livestream fallback: **YouTube embed**, because it is more LIFF/browser friendly.
- Admin must be able to replace livestream links for every new stream.
- LINE Official Account / LIFF channel is not created yet. Owner will provide credentials later.

## 3. Existing Design Assets

The folder `UX:UI Design` already contains the visual prototype and should be used as the production UI reference.

- `Lucky Draw Home.html`: stream-first home page and active draw summary.
- `Lucky Draw Lot Detail.html`: current slot picker UI.
- `Lucky Draw Payment.html`: PromptPay/bank transfer UI and slip upload.
- `Lucky Draw Orders.html`: customer order tracking.
- `Lucky Draw Admin.html`: admin UI for draw settings, cards, orders, slots.
- `lucky-draw-shared.css`: visual system.
- `lucky-draw-data.js`: prototype localStorage data layer.

Important adjustment:

The existing prototype currently lets the customer pick numbers before payment. Production should change this to:

**Pay first -> admin approves -> pick numbers.**

The slot picker design can still be reused, but it should be shown only after an order is approved and has remaining picks.

## 3.1 Button Completion Plan

Goal: every visible button, tab, picker, upload, and admin action should either complete the real action, show a useful disabled/loading/error state, or navigate to the correct next step.

Recommended order:

1. Customer basics:
   - Home: LINE login, language toggle, Pay, Pick, Orders, and livestream platform buttons.
   - Payment: quantity selector, slip upload, create order, copy payment details, and validation before submit.
   - Orders: search, view order details, view slip/status, continue to Pick when approved.
   - Pick: order selector, slot buttons, exact quantity enforcement, confirm numbers, and success feedback.

2. Admin operations:
   - Draw settings save.
   - Payment settings save.
   - Approve/reject payment with confirmation and audit record.
   - Manual slot assignment for a customer.
   - Card list add/remove/edit controls.
   - Stream link update controls.

3. Production wiring:
   - Replace demo localStorage actions with Supabase reads/writes.
   - Connect LINE LIFF identity to customer orders.
   - Upload payment slips to protected storage.
   - Add loading, success, and error toasts for every mutation.
   - Block duplicate submits while a request is pending.

4. Verification:
   - Make a button inventory for each page and mark each item as working, disabled by design, or pending backend.
   - Test on mobile width first, especially fixed bottom navigation and bottom action buttons.
   - Test the full path: login -> pay -> admin approve -> pick -> orders.
   - Test admin path: edit draw -> approve/reject -> assign slots -> update cards/stream.
   - Add focused automated tests for critical state transitions once backend wiring starts.

Supabase wiring now uses server API routes:

- `GET /api/lucky-draw`: loads the active draw and the current user's orders. Admin users see all orders.
- `POST /api/lucky-draw`: creates a customer order after LINE login.
- `POST /api/lucky-draw/picks`: confirms customer slot picks through the atomic database RPC.
- `PATCH /api/lucky-draw/admin/order`: admin approve/reject/manual slot assignment.
- `PATCH /api/lucky-draw/admin/draw`: admin draw/payment/stream settings save.
- `POST /api/lucky-draw/admin/qr`: admin uploads and replaces the payment QR image.

Current payment-slip decision:

- Phase 1 uses **manual admin slip checking**.
- Customers can submit an order with slip proof or manual slip note; admin checks it first.
- Paid/third-party slip-check APIs are intentionally **future work** because they add operating cost.
- The next implementation step should store uploaded slip files privately, then let admin view them from a protected admin action.

## 3.2 Current Build Status And Next Phase

Already working:

- Supabase-backed active draw and order data.
- LINE LIFF session verification with admin membership from `admin_users`.
- Customer order creation after LINE login.
- Admin approve/reject payment.
- Customer/admin slot picking through atomic database RPC.
- Admin draw/payment/stream settings save.
- Admin payment QR upload and Pay page QR display.
- Customer payment slip upload to private Supabase Storage.
- Protected Admin slip review with short-lived signed URLs.
- Mobile bottom navigation clearance for LIFF.

Next build phase:

1. **Realtime operations**
   - Admin sees new orders and picked slots without refreshing.
   - Customer sees approval and slot changes without refreshing.

2. **Admin workflow hardening**
   - Add confirmation, loading, and error states around approve/reject/manual pick.
   - Add admin notes and basic filters for pending/approved/picked/rejected orders.

3. **Post-livestream operations**
   - Add result notes and shipping/tracking after the draw.
   - Keep this after payment/slip/realtime stability.

Admin setup after the owner LINE account logs in once:

```sql
insert into public.admin_users (profile_id, role)
select id, 'owner'
from public.profiles
where line_user_id = '<OWNER_LINE_USER_ID>'
on conflict (profile_id) do update
set role = excluded.role, is_active = true;
```

## 4. Recommended Architecture

### 4.1 Frontend And Hosting

Use:

- **Next.js**
- **Vercel free tier**
- Mobile-first responsive UI
- LINE LIFF SDK
- Bilingual copy dictionary: Thai and English

Why Next.js:

- Easy deployment on Vercel.
- Good routing for customer pages and admin pages.
- API routes or server actions can securely talk to Supabase, LINE, and upload services.
- Can keep service keys and LINE secrets server-side.

### 4.2 Do We Need Supabase For Starter?

For real production, **yes, we should use Supabase from the start**, even if we store minimal customer details.

We do not need to store too much personal customer information. However, we need shared production state that cannot live only in the browser:

- Active draw settings.
- Stream links that admin can update.
- Slot availability.
- Paid order amount.
- Number of picks allowed.
- Slip verification status.
- Which LINE user owns each approved order.
- Which numbers were selected.
- Admin audit/history.

Without Supabase, each customer browser would have its own local data and the admin would not have reliable shared control.

Recommended Supabase usage:

- **Postgres database** for draw, order, slot, and admin data.
- **Row Level Security enabled** for exposed tables.
- Store only necessary customer identity:
  - LINE user ID
  - LINE display name, if needed
  - optional phone/LINE contact typed by user
- Avoid storing unnecessary sensitive information.

### 4.3 Payment Slip Handling

Phase 1 decision:

- Admin checks payment slips manually.
- Do not use a paid slip-check API yet.
- Keep API slip checking as a future upgrade when order volume justifies the cost.

Recommended Phase 1 storage:

- Use Supabase Storage private bucket `payment-slips`.
- Store only metadata in Supabase: storage provider, private file path, original filename, upload time, and review status.
- Admin views slip files through a protected admin API that returns a short-lived signed URL.
- Customers should not see other customers' slips, and slip files should not be public.

Manual fallback:

- If customer cannot upload a slip in LIFF, customer can send the slip to LINE Official Account.
- Admin can still approve/reject the order manually from Admin.
- Store this as `storage_provider = manual_line` with a note/filename so the order remains trackable.

Future automation:

- Add paid slip-check API only after the manual flow is stable.
- The API should pre-fill verification status or flag suspicious slips, but admin should remain the final approver at first.

## 5. Production User Flow

### 5.1 Customer Entry

1. Customer opens Lucky Draw LIFF URL from LINE.
2. App initializes LIFF.
3. If not logged in, customer is redirected to LINE login.
4. App receives LINE profile and ID token.
5. Server verifies LINE ID token using LINE channel credentials.
6. App creates or updates lightweight user profile in Supabase.
7. Customer lands on home page.

Fallback:

- If opened outside LINE, show normal responsive website.
- For production purchases, ask user to open through LINE login before checkout.

### 5.2 Browse Draw

Customer sees:

- Active draw.
- Card series: Pokemon or One Piece.
- Price per draw.
- Remaining available slots.
- Total slots.
- Stream area.
- Facebook Live button.
- YouTube embedded stream if available.
- TikTok/Facebook/YouTube external buttons.
- Thai/English toggle.

### 5.3 Buy Draw Chances

Customer selects quantity before payment.

Example quantity controls:

- Minus button
- Number input
- Plus button
- Total amount auto-calculates

Rules:

- Quantity must be at least 1.
- Quantity cannot exceed available slots.
- Total = quantity x price per draw.
- Customer does not pick numbers yet.

### 5.4 Payment

Customer sees:

- Draw name
- Quantity
- Total amount
- PromptPay QR or payment instructions
- Bank transfer account
- Upload slip option, if enabled
- Contact note for LINE Official Account

Customer submits:

- Quantity paid for
- Total amount expected
- Slip image or manual slip note

System creates order:

- `payment_status = pending`
- `pick_status = locked`
- `picks_allowed = quantity`
- `picks_used = 0`
- no slot numbers yet

### 5.5 Admin Payment Verification

Admin reviews pending order:

- LINE user
- display name
- amount expected
- quantity purchased
- slip image or note
- submitted time

Admin actions:

- Approve
- Reject
- Add note

When approved:

- `payment_status = approved`
- `pick_status = open`
- customer can pick numbers

When rejected:

- `payment_status = rejected`
- customer cannot pick
- admin note explains why

### 5.6 Pick Numbers After Approval

Customer opens approved order.

System shows:

- Pick quota: e.g. `0 / 4 selected`
- Available envelope grid
- Taken numbers disabled
- Selected numbers highlighted

Rules:

- Customer can pick exactly `picks_allowed` numbers.
- Customer cannot submit with fewer or more than allowed.
- On submit, database must atomically claim the selected numbers.
- If a number was taken by someone else at the same time, show an error and ask customer to choose another.

After submit:

- Slots become `taken`.
- Order saves selected numbers.
- `pick_status = completed`.

### 5.7 Livestream And Result

During livestream:

- Streamer sees paid customer name/display name and selected numbers.
- Streamer opens each selected envelope live.
- Admin can mark result card for each slot/order after reveal.

Later:

- Admin adds shipping/tracking code.
- Customer sees status update in My Orders.

## 6. Admin Features

### 6.1 Admin Authentication

The prototype PIN is not enough for real production.

Phase 1 recommendation:

- Protect `/admin` with a strong admin password using server-side auth.
- Store admin password hash or use a simple provider such as Supabase Auth.

Later:

- Add admin roles.
- Add multiple staff accounts.

### 6.2 Draw Management

Admin can:

- Create/edit draw round.
- Set draw status:
  - draft
  - live
  - ended
- Set series:
  - Pokemon
  - One Piece
  - Other
- Set price per draw.
- Set total slots.
- Set stream date/time.
- Set payment details.
- Set language display copy where needed.

### 6.3 Livestream Link Management

Admin must be able to update links for every new livestream:

- Facebook Live URL
- YouTube Live URL or embed URL
- TikTok Live URL
- Main platform selector
- Stream status text

Frontend behavior:

- Prefer YouTube embed when a YouTube URL is available.
- Show Facebook as the main call-to-action because the owner’s main platform is Facebook.
- Show external buttons for Facebook, YouTube, TikTok.
- If embed fails or is missing, show platform buttons instead of a blank player.

### 6.4 Card Management

Admin can manage:

- Card name
- Series
- Grade
- Estimated value
- Highlight flag
- Prize rank
- Image URL

For MVP, images can be optional. The design can use placeholder card thumbnails until real card photos are ready.

### 6.5 Order Management

Admin can:

- See pending payments.
- View slip image or manual slip note.
- Approve/reject payment.
- See approved orders waiting for number selection.
- See completed selected numbers.
- Add result card after stream.
- Add shipping/tracking code.
- Filter by status.

### 6.6 Slot Management

Admin can:

- View all slots.
- See available/taken status.
- See which order/customer owns each slot.
- Manually adjust a slot if needed.

Manual adjustment should be logged because real money is involved.

## 7. Bilingual Language Plan

Languages:

- Thai
- English

Implementation:

- Use a small translation dictionary in the app.
- Store chosen language in localStorage.
- Default to Thai for Thai audience unless user switches.
- Keep admin labels English or bilingual depending on preference.

Important customer pages should be bilingual:

- Home
- Draw detail
- Payment
- My orders
- Login/access screen
- Error states
- Payment instructions
- Terms/refund text

## 8. LINE LIFF Plan

### 8.1 Needed From Owner Later

After LINE channel is created, provide:

- LIFF ID
- Channel ID
- Channel secret
- LINE Login channel settings
- LINE Official Account ID/link
- Messaging API channel access token, only if the app will send LINE messages automatically

Security note:

- Channel secret and Messaging API access token must stay server-side.
- Do not expose them in frontend code or `NEXT_PUBLIC_` variables.

### 8.2 LIFF App Behavior

Frontend:

- Load LIFF SDK.
- Initialize with `LIFF_ID`.
- Check login status.
- Request login if needed.
- Get ID token/profile.
- Send token to server for verification.

Server:

- Verify ID token with LINE.
- Create/update app user.
- Start app session.

User record should be minimal:

- LINE user ID
- display name
- picture URL optional
- last login timestamp

### 8.3 Outside-LINE Behavior

Because users may open the site on desktop or other browsers:

- Public browsing can work anywhere.
- Checkout requires LINE login.
- If LIFF login cannot run, show "Open in LINE" button or QR code.

## 9. Data Model

### 9.1 `users`

- `id`
- `line_user_id`
- `line_display_name`
- `line_picture_url`
- `preferred_language`
- `created_at`
- `updated_at`

### 9.2 `draws`

- `id`
- `name_en`
- `name_th`
- `series`
- `status`: draft, live, ended
- `price_per_draw`
- `total_slots`
- `stream_date`
- `main_stream_platform`: facebook, youtube, tiktok
- `facebook_live_url`
- `youtube_live_url`
- `youtube_embed_url`
- `tiktok_live_url`
- `bank_name`
- `bank_account`
- `bank_holder`
- `promptpay_id`
- `terms_en`
- `terms_th`
- `created_at`
- `updated_at`

### 9.3 `cards`

- `id`
- `draw_id`
- `name_en`
- `name_th`
- `series`
- `grade`
- `estimated_value`
- `highlight`
- `prize_rank`
- `image_url`
- `created_at`
- `updated_at`

### 9.4 `orders`

- `id`
- `draw_id`
- `user_id`
- `line_user_id`
- `quantity`
- `total_amount`
- `payment_status`: pending, approved, rejected
- `pick_status`: locked, open, completed
- `picks_allowed`
- `picks_used`
- `slip_image_url`
- `slip_storage_id`
- `customer_note`
- `admin_note`
- `approved_at`
- `rejected_at`
- `created_at`
- `updated_at`

### 9.5 `slots`

- `id`
- `draw_id`
- `number`
- `status`: available, taken
- `order_id`
- `user_id`
- `taken_at`
- `created_at`
- `updated_at`

No `pending` slot status is required in phase 1 because the user pays before choosing.

### 9.6 `order_results`

- `id`
- `order_id`
- `slot_id`
- `card_name`
- `card_id`
- `result_note`
- `shipping_code`
- `created_at`
- `updated_at`

### 9.7 `admin_audit_logs`

- `id`
- `admin_user_id`
- `action`
- `entity_type`
- `entity_id`
- `before_json`
- `after_json`
- `created_at`

## 10. Supabase Security Plan

Because this is production, use these rules from the beginning:

- Enable Row Level Security on public tables.
- Do not expose Supabase service role key to the browser.
- Use server-side code for admin operations.
- Use server-side code for payment approval and slot claiming.
- Public customer can only read live draw data and available slot numbers.
- Logged-in LINE user can read only their own orders.
- Logged-in LINE user can create payment orders for themselves.
- Logged-in LINE user can choose slots only for their own approved order.
- Admin can manage draws, cards, orders, slots, and results.
- Slip image access should go through protected admin/customer views where possible.

Slot claiming must be atomic:

- One server action/API endpoint receives `order_id` and selected slot numbers.
- Server verifies:
  - order belongs to user
  - payment is approved
  - pick status is open
  - selected count equals remaining picks
  - all selected slots are still available
- Server writes all slot claims in one transaction.

## 11. Deployment Plan

### 11.1 Vercel Environment Variables

Expected variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_LINE_LIFF_ID`
- `LINE_LOGIN_CHANNEL_ID`
- `LINE_SESSION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_AUTH_SECRET`

Future optional variables:

- Slip-check provider credentials, only when automated slip verification is added.
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, only when LINE notifications are enabled.

Only `NEXT_PUBLIC_*` variables can be exposed to the browser.

### 11.2 Deployment Steps

1. Build Next.js app locally.
2. Connect repo to Vercel.
3. Create Supabase project.
4. Add database schema and RLS policies.
5. Add environment variables to Vercel.
6. Deploy preview.
7. Test with design screens and mobile layout.
8. Create LINE LIFF app.
9. Add Vercel production URL to LIFF endpoint.
10. Test LINE login inside LINE.
11. Run a full fake order:
    - login
    - choose quantity
    - submit payment
    - admin approve
    - customer pick numbers
    - admin sees selected numbers
12. Deploy production URL.

## 12. Phase Plan

### Phase 0: Setup And Confirmation

Owner provides:

- Bank name
- Bank account number
- Bank account holder
- PromptPay ID
- LINE Official Account link or ID
- First draw name Thai/English
- Price per draw
- Total envelope count
- Highlight card list
- Card photos if available
- Facebook page/live URL style
- YouTube channel/live URL if available
- Thai/English payment instruction text
- Terms/refund/shipping policy text

Technical setup:

- Create Next.js project.
- Use manual admin slip checking first, with Supabase Storage for private uploaded slip files.
- Create Supabase project.
- Prepare Vercel project.

### Phase 1: Production MVP

Build:

- Home page
- Draw detail / buy quantity page
- Payment page
- Manual admin slip checking with protected slip upload/viewing
- My orders page
- Approved-order number picker
- Admin dashboard
- Draw settings
- Stream link management
- Order approval
- Slot claiming
- Thai/English toggle
- Vercel deployment

Production MVP success criteria:

- Customer can enter through LIFF.
- Customer must be LINE-verified before purchase.
- Customer can pay for multiple draw chances.
- Admin can approve payment.
- Admin can view submitted slip proof or manual LINE note before approval.
- Approved customer can pick exactly the paid quantity of numbers.
- Taken numbers cannot be selected by other customers.
- Admin can replace livestream links for every stream.
- Site works on LINE in-app browser, iOS Safari, Android Chrome, and desktop Chrome.

### Phase 2: Better Operations

Add:

- Automatic LINE notifications.
- Better admin login / multiple admins.
- Stronger admin workflow: filters, notes, confirmations, and private signed slip URLs.
- Result recording per selected slot.
- Shipping management.
- CSV export.
- Sales summary.
- Search/filter orders by LINE name, order ID, slot number.

### Phase 3: Growth

Add:

- Multiple active/upcoming draws.
- Customer order history across all draws.
- Ranking/leaderboard.
- Promotions/coupons.
- Wallet or credit system if needed.
- Inventory/card catalog.
- Automated payment verification with a paid slip-check API when order volume justifies it.

## 13. Page Map

Customer:

- `/`
  - Home and active draw.
- `/draw/[drawId]`
  - Draw detail and quantity selection.
- `/checkout/[drawId]`
  - Payment and slip submission.
- `/orders`
  - Customer order list.
- `/orders/[orderId]`
  - Order detail and status.
- `/orders/[orderId]/pick`
  - Number picker after approval.

Admin:

- `/admin/login`
- `/admin`
  - Dashboard.
- `/admin/draws`
- `/admin/draws/[drawId]`
- `/admin/orders`
- `/admin/orders/[orderId]`
- `/admin/slots/[drawId]`
- `/admin/settings`

API/server actions:

- Verify LINE login.
- Create payment order.
- Upload slip.
- Approve/reject order.
- Claim selected slots.
- Update stream links.
- Update draw/card settings.

## 14. Important Risks And Decisions

### 14.1 Double Selection

Risk:

- Two approved customers may try to pick the same number.

Solution:

- Slot selection must be committed server-side in one transaction.
- UI should refresh availability before submit.
- If conflict happens, reject and ask user to choose again.

### 14.2 Slip Privacy

Risk:

- Bank slips may expose names, amounts, timestamps, or bank details.

Solution:

- Store only what is needed.
- Avoid showing slip image publicly.
- Keep admin slip viewing behind authentication.
- Consider private storage/signed URLs after MVP.

### 14.3 LINE Credentials

Risk:

- Channel secret or Messaging token leaked.

Solution:

- Store secret values only in Vercel server environment variables.
- Never commit `.env.local`.
- Never use secret values in client code.

### 14.4 Livestream Embeds

Risk:

- Facebook/TikTok embeds may not work reliably inside LINE LIFF.

Solution:

- Use YouTube as preferred embedded player when possible.
- Keep Facebook as main external call-to-action.
- Admin can update all stream links each event.
- UI must handle missing embed gracefully.

### 14.5 Compliance

Risk:

- Paid random draw mechanics may be regulated or restricted by local law or platform policies.

Solution:

- Add clear public terms.
- Explain exactly what the customer purchases.
- Explain live reveal process.
- Explain refund/cancellation rules.
- Explain shipping rules.
- Owner should verify local legal requirements before launch.

## 15. Build Order

Recommended implementation order:

1. Scaffold Next.js app.
2. Port visual system from existing HTML/CSS.
3. Build static customer pages from design.
4. Build bilingual dictionary and language toggle.
5. Add Supabase schema locally/remotely.
6. Add draw/card/slot read APIs.
7. Add LIFF login shell.
8. Add order creation after payment form.
9. Add admin/manual slip checking with protected Supabase Storage upload.
10. Add admin order approval.
11. Add approved-order slot picker.
12. Add atomic slot claiming.
13. Add admin livestream link editor.
14. Deploy to Vercel preview.
15. Test full flow.
16. Connect LINE LIFF.
17. Final mobile and LIFF QA.
18. Production deploy.

## 16. Open Items

These are still needed before implementation or before production launch:

- Confirm exact admin slip review wording and whether manual LINE note is enough for launch.
- Confirm first draw data.
- Confirm payment account details.
- Confirm Thai/English wording.
- Confirm admin login method for phase 1.
- Create LINE Login / LIFF channel.
- Provide LIFF credentials.
- Decide whether phase 1 needs automatic LINE notifications or manual admin contact is enough.
- Prepare terms/refund/shipping text.

## 17. Final Recommendation

Use this stack for production MVP:

**Next.js + Vercel + Supabase + LINE LIFF.**

Supabase is worth using from the start because the app needs trustworthy shared state, not because we want to collect lots of customer data. We can store minimal LINE identity and order records, keep slip files private, and still make the most important production behavior reliable: paid customer gets the correct number of picks, selected envelope numbers cannot be duplicated, and admin can control every livestream round from the dashboard.
