import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import api from "../lib/api";
import { statusConfig, SessionStatus } from "../lib/sessionStatus";

export default function SessionStatusIndicator() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      try {
        const { data } = await api.get("/whatsapp/session/status");
        if (active) setStatus(data.data);
      } catch {
        // keep last known status; ignore transient errors
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const config = status ? statusConfig[status.status] || statusConfig.STOPPED : null;

  return (
    <button
      type="button"
      onClick={() => navigate("/whatsapp")}
      className={`mb-4 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted ${config?.bg ?? "bg-muted/50"}`}
      title="Lihat status sesi WhatsApp"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config?.iconBg ?? "bg-gray-100"}`}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        ) : (
          config?.icon && (
            <config.icon
              className={`h-4 w-4 ${config.iconColor} ${status?.status === "STARTING" || status?.status === "SCAN_QR_CODE" ? "animate-spin" : ""}`}
            />
          )
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-foreground">
          {loading ? "Mengecek sesi…" : config?.label ?? "Tidak diketahui"}
        </p>
        {status?.status === "WORKING" && status.number && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {status.number}
          </p>
        )}
      </div>
    </button>
  );
}
