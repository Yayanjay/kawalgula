import { CheckCircle, XCircle, Loader2, type LucideIcon } from "lucide-react";

export interface SessionStatus {
  status: string;
  number: string | null;
}

export const statusConfig: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    icon: LucideIcon;
    hint: string;
  }
> = {
  STOPPED: {
    label: "Terhenti",
    color: "bg-gray-500",
    bg: "bg-gray-50",
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
    icon: XCircle,
    hint: "Session tidak aktif",
  },
  STARTING: {
    label: "Memulai...",
    color: "bg-yellow-500",
    bg: "bg-yellow-50",
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-600",
    icon: Loader2,
    hint: "Menghubungkan ke WhatsApp...",
  },
  SCAN_QR_CODE: {
    label: "Scan QR Code",
    color: "bg-blue-500",
    bg: "bg-blue-50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    icon: Loader2,
    hint: "Scan QR untuk menghubungkan",
  },
  WORKING: {
    label: "Terhubung",
    color: "bg-green-500",
    bg: "bg-green-50",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    icon: CheckCircle,
    hint: "",
  },
  FAILED: {
    label: "Gagal",
    color: "bg-red-500",
    bg: "bg-red-50",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    icon: XCircle,
    hint: "Koneksi gagal, coba lagi",
  },
};
