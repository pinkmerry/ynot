import type { YnotTopUp } from "./types";

function TopUpStatusBadge({ status }: { status: string }) {
  return (
    <span className="status-pill px-3 py-1 text-xs">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function TopUpEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="title-s">{title}</p>
      <p className="txt-s mt-2">{body}</p>
    </div>
  );
}

export function TopUpTable({
  topUps,
  admin,
}: {
  topUps: YnotTopUp[];
  admin?: boolean;
}) {
  if (!topUps.length)
    return (
      <TopUpEmptyState
        title="No top-up requests"
        body="Upload a transfer slip to create the first manual review request."
      />
    );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="section-label">
          <tr>
            <th className="py-2">Code</th>
            <th>Coins</th>
            <th>Amount</th>
            <th>Status</th>
            {admin && <th>Method</th>}
            {admin && <th>Slip check</th>}
            <th>Created</th>
            {admin && <th>Profile</th>}
          </tr>
        </thead>
        <tbody>
          {topUps.map((topUp) => (
            <tr
              key={topUp.id ?? topUp.publicCode}
              className="border-t border-[var(--border)]"
            >
              <td className="py-3 font-mono font-bold">{topUp.publicCode}</td>
              <td>{topUp.coinAmount.toLocaleString()}</td>
              <td>฿{topUp.amountThb.toLocaleString()}</td>
              <td>
                <TopUpStatusBadge status={topUp.status} />
              </td>
              {admin && (
                <td>
                  {topUp.paymentMethod?.displayName ?? "Unknown method"}
                </td>
              )}
              {admin && (
                <td>
                  <TopUpStatusBadge
                    status={topUp.slipVerification?.status ?? "not_uploaded"}
                  />
                  {topUp.slipVerification?.providerCode && (
                    <span className="ml-2 font-mono text-xs">
                      {topUp.slipVerification.providerCode}
                    </span>
                  )}
                </td>
              )}
              <td>{new Date(topUp.createdAt).toLocaleString()}</td>
              {admin && (
                <td className="font-mono text-xs">
                  {topUp.profileId?.slice(0, 8) ?? "Unknown"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
