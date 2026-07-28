import { useEffect, useState, useRef, useCallback } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import { Smartphone, RefreshCw, Loader2 } from "lucide-react";
import { statusConfig, SessionStatus } from "../lib/sessionStatus";

export default function WhatsappPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [qrTs, setQrTs] = useState(Date.now());
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>();
  const qrBlobRef = useRef<string | null>(null);
  const forcePollRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/whatsapp/session/status");
      setStatus(data.data);
    } catch {
      // ignore
    }
  }, []);

  const fetchQr = useCallback(async () => {
    try {
      const response = await api.get("/whatsapp/session/qr", {
        responseType: "blob",
      });
      if (qrBlobRef.current) URL.revokeObjectURL(qrBlobRef.current);
      const blobUrl = URL.createObjectURL(response.data);
      qrBlobRef.current = blobUrl;
      setQrUrl(blobUrl);
    } catch {
      setQrUrl(null);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => {
      clearInterval(pollingRef.current);
      clearTimeout(forcePollRef.current);
    };
  }, [fetchStatus]);

  useEffect(() => {
    return () => {
      if (qrBlobRef.current) URL.revokeObjectURL(qrBlobRef.current);
    };
  }, []);

  useEffect(() => {
    clearInterval(pollingRef.current);
    if (status?.status === "SCAN_QR_CODE" || status?.status === "STARTING") {
      pollingRef.current = setInterval(fetchStatus, 3000);
    }
    return () => clearInterval(pollingRef.current);
  }, [status?.status, fetchStatus]);

  useEffect(() => {
    if (status?.status === "SCAN_QR_CODE") {
      fetchQr();
    } else {
      if (qrBlobRef.current) {
        URL.revokeObjectURL(qrBlobRef.current);
        qrBlobRef.current = null;
      }
      setQrUrl(null);
    }
  }, [status?.status, qrTs, fetchQr]);

  const handleAction = async (action: "start" | "stop" | "delete") => {
    setProcessing(action);
    try {
      if (action === "delete") {
        await api.delete("/whatsapp/session");
        clearInterval(pollingRef.current);
        clearTimeout(forcePollRef.current);
        await fetchStatus();
        toast("Session dihapus", "success");
      } else {
        await api.post(`/whatsapp/session/${action}`);
        if (action === "start") {
          toast("Session dimulai", "success");
          clearInterval(pollingRef.current);
          clearTimeout(forcePollRef.current);
          setStatus({ status: "STARTING", number: null });
          const interval = setInterval(fetchStatus, 2000);
          forcePollRef.current = setTimeout(() => {
            clearInterval(interval);
          }, 30000);
        } else {
          clearInterval(pollingRef.current);
          clearTimeout(forcePollRef.current);
          await fetchStatus();
          toast("Session dihentikan", "success");
        }
      }
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
    setProcessing(null);
  };

  const config = status ? statusConfig[status.status] || statusConfig.STOPPED : null;

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6" />
        <h2 className="text-xl font-bold">WhatsApp Session</h2>
      </div>

      {config && (
        <div className={`flex items-center gap-4 rounded-xl border p-5 ${config.bg}`}>
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
            <config.icon
              className={`h-6 w-6 ${config.iconColor} ${status?.status === "STARTING" || status?.status === "SCAN_QR_CODE" ? "animate-spin" : ""}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base">{config.label}</p>
              {status?.status === "WORKING" && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-full w-2 rounded-full bg-green-500"></span>
                </span>
              )}
            </div>
            {status?.status === "WORKING" && status.number && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                <span className="font-medium">{status.number}</span>
              </p>
            )}
            {status?.status !== "WORKING" && config.hint && (
              <p className="mt-1 text-sm text-muted-foreground">{config.hint}</p>
            )}
          </div>
        </div>
      )}

      {status?.status === "SCAN_QR_CODE" && qrUrl && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Scan QR code ini dari WhatsApp → Perangkat tertaut → Tautkan perangkat
          </p>
          <img
            src={qrUrl}
            alt="QR Code"
            className="mx-auto w-64 h-64"
          />
          <button
            onClick={() => setQrTs(Date.now())}
            className="flex items-center gap-2 text-sm text-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh QR
          </button>
        </div>
      )}

      {status?.status === "SCAN_QR_CODE" && !qrUrl && (
        <div className="rounded-lg border p-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Memuat QR Code...</p>
        </div>
      )}

      <div className="flex gap-3">
        {processing !== "stop" && processing !== "delete" && status?.status !== "WORKING" && (
          <button
            onClick={() => handleAction("start")}
            disabled={processing !== null}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {processing === "start" && <Loader2 className="h-4 w-4 animate-spin" />}
            {processing === "start" ? "Memulai..." : "Mulai Session"}
          </button>
        )}
        {processing !== "start" && processing !== "delete" && status?.status === "WORKING" && (
          <button
            onClick={() => handleAction("stop")}
            disabled={processing !== null}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {processing === "stop" && <Loader2 className="h-4 w-4 animate-spin" />}
            {processing === "stop" ? "Menghentikan..." : "Hentikan Session"}
          </button>
        )}
        {processing !== "start" && processing !== "stop" && (
          <button
            onClick={() => handleAction("delete")}
            disabled={processing !== null}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {processing === "delete" && <Loader2 className="h-4 w-4 animate-spin" />}
            {processing === "delete" ? "Menghapus..." : "Hapus Session"}
          </button>
        )}
      </div>
    </div>
  );
}
