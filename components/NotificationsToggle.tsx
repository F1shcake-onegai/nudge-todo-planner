"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationsToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        setSubscribed(false);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setSubscribed(!!sub);
    })();
  }, []);

  async function enable() {
    setLoading(true);
    try {
      const info = await fetch("/api/push/vapid").then((r) => r.json());
      if (!info.publicKey) {
        alert("No VAPID key yet. Go to Settings → API keys and click 'Generate VAPID'.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(info.publicKey),
      });
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (r.ok) setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  if (subscribed === null) return null;

  return (
    <button
      type="button"
      onClick={subscribed ? disable : enable}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
        "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--bg)]",
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : subscribed ? (
        <Bell className="size-4 text-[var(--accent)]" />
      ) : (
        <BellOff className="size-4 text-[var(--muted)]" />
      )}
      {subscribed ? "Notifications on" : "Enable notifications"}
    </button>
  );
}
