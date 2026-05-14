"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { YnotTierAnimation } from "@/features/ynot/types";

type Props = {
  tier: YnotTierAnimation;
};

const TIER_LABELS: Record<string, string> = {
  rainbow: "Rainbow (highest)",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};

export function AdminTierAnimationForm({ tier }: Props) {
  const router = useRouter();
  const [duration, setDuration] = useState(String(tier.durationMs));
  const [isActive, setIsActive] = useState(tier.isActive);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("tier", tier.tier);
    data.set("durationMs", duration);
    data.set("isActive", isActive ? "true" : "false");
    const video = data.get("video");
    if (video instanceof File && video.size === 0) data.delete("video");
    const poster = data.get("poster");
    if (poster instanceof File && poster.size === 0) data.delete("poster");
    const audio = data.get("audio");
    if (audio instanceof File && audio.size === 0) data.delete("audio");

    startTransition(async () => {
      try {
        const res = await fetch("/api/ynot/admin/tier-animations", {
          method: "POST",
          body: data,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          tierAnimation?: unknown;
        };
        if (!res.ok) {
          setError(json.error ?? `Update failed (${res.status})`);
          return;
        }
        setMessage("Saved");
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <form className="admin-card admin-tier-form" onSubmit={submit}>
      <header className="admin-tier-form-header">
        <h3>{TIER_LABELS[tier.tier] ?? tier.tier}</h3>
        <span className="admin-tier-form-state" data-active={isActive ? "1" : "0"}>
          {isActive ? "ACTIVE" : "INACTIVE"}
        </span>
      </header>

      <dl className="admin-tier-form-current">
        <div>
          <dt>Video</dt>
          <dd>
            {tier.videoUrl ? (
              <a href={tier.videoUrl} target="_blank" rel="noreferrer">
                {tier.videoUrl.split("/").pop()}
              </a>
            ) : (
              <em>none — CSS mockup will play</em>
            )}
          </dd>
        </div>
        <div>
          <dt>Poster</dt>
          <dd>
            {tier.posterUrl ? (
              <a href={tier.posterUrl} target="_blank" rel="noreferrer">
                {tier.posterUrl.split("/").pop()}
              </a>
            ) : (
              <em>none</em>
            )}
          </dd>
        </div>
        <div>
          <dt>Sound</dt>
          <dd>
            {tier.soundUrl ? (
              <a href={tier.soundUrl} target="_blank" rel="noreferrer">
                {tier.soundUrl.split("/").pop()}
              </a>
            ) : (
              <em>none</em>
            )}
          </dd>
        </div>
      </dl>

      <label className="admin-tier-form-field">
        <span>Replace video (mp4 / webm, ≤ 20MB)</span>
        <input type="file" name="video" accept="video/mp4,video/webm" />
      </label>

      <label className="admin-tier-form-field">
        <span>Replace poster image (optional, png / jpg / webp)</span>
        <input type="file" name="poster" accept="image/png,image/jpeg,image/webp" />
      </label>

      <label className="admin-tier-form-field">
        <span>Replace sound (optional, mp3 / wav / ogg)</span>
        <input type="file" name="audio" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg" />
      </label>

      <label className="admin-tier-form-field">
        <span>Duration (ms, 500–15000)</span>
        <input
          type="number"
          min={500}
          max={15000}
          step={100}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </label>

      <label className="admin-tier-form-toggle">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Active (shown to players)</span>
      </label>

      <div className="admin-tier-form-footer">
        <button
          type="submit"
          className="primary-action"
          disabled={isPending}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {message && <span className="admin-tier-form-message">{message}</span>}
        {error && <span className="admin-tier-form-error">{error}</span>}
      </div>
    </form>
  );
}
