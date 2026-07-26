import { useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";

interface Template {
  key: string;
  type: string;
  title: string;
  body: string;
  buttonLabels: string[];
}

const typeLabels: Record<string, string> = {
  enrollment: "Pendaftaran",
  reminder: "Pengingat",
  optin_confirm: "Konfirmasi Setuju",
  usage_hint: "Bantuan",
  already_opted_in: "Sudah Terdaftar",
  confirmation: "Konfirmasi",
};

const typeOrder = ["reminder", "confirmation", "enrollment", "optin_confirm", "usage_hint", "already_opted_in"];

interface TemplateInfo {
  event: string;
  vars: string[];
}

const templateInfo: Record<string, TemplateInfo> = {
  reminder: { event: "Jadwal minum obat tiba", vars: ["name", "medication_name", "dosage", "unit"] },
  taken_confirm: { event: "Pasien menjawab \"sudah\"", vars: ["name"] },
  belum_retry: { event: "Pasien menjawab \"belum\" (masih ada pengulangan)", vars: ["name"] },
  belum_exhausted: { event: "Pasien menjawab \"belum\" (pengulangan habis)", vars: ["name"] },
  enrollment: { event: "Kirim undangan pendaftaran ke pasien baru", vars: ["name"] },
  wa_prefill: { event: "Teks isian otomatis pada link WA (QR enrollment)", vars: ["token"] },
  optin_confirm: { event: "Pasien menyetujui pendaftaran", vars: ["name"] },
  usage_hint: { event: "Pesan tidak dikenali / bantuan cara balas", vars: [] },
  already_opted_in: { event: "Pasien sudah terdaftar (resend opt-in)", vars: ["name"] },
};

function getTemplateInfo(key: string): TemplateInfo {
  return templateInfo[key] || { event: "", vars: ["name"] };
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", body: "", buttonLabels: "" });
  const [previews, setPreviews] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchTemplates = async () => {
    try {
      const { data } = await api.post("/templates/list", {
        page: 1,
        size: 20,
        sort: [{ key: "key", direction: "ASC" }],
      });
      setTemplates(data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  useEffect(() => {
    if (!templates.length) return;
    templates.forEach(async (t) => {
      try {
        const { data } = await api.post("/templates/preview", {
          key: t.key,
          variables: { name: "Budi", medication_name: "Metformin", dosage: "500mg", unit: "tablet", token: "abc12345" },
        });
        setPreviews((p) => ({ ...p, [t.key]: data.data }));
      } catch {
        // ignore
      }
    });
  }, [templates]);

  const grouped = typeOrder
    .map((t) => ({ type: t, label: typeLabels[t] || t, items: templates.filter((tm) => tm.type === t) }))
    .filter((g) => g.items.length);

  const startEdit = (t: Template) => {
    setEditing(t.key);
    setExpanded(t.key);
    setForm({ title: t.title, body: t.body, buttonLabels: t.buttonLabels.join(", ") });
  };

  const cancelEdit = (t: Template) => {
    setEditing(null);
    setForm({ title: "", body: "", buttonLabels: "" });
  };

  const handleSave = async (t: Template) => {
    setSubmitting(true);
    const labels = form.buttonLabels.split(",").map((l) => l.trim()).filter(Boolean);
    try {
      await api.patch(`/templates/${t.key}`, { title: form.title, body: form.body, buttonLabels: labels });
      await fetchTemplates();
      setEditing(null);
      toast("Template disimpan");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal menyimpan", "error");
    }
    setSubmitting(false);
  };

  const renderButtons = (labels: string[]) => {
    if (!labels.length) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {labels.map((l, i) => (
          <span key={i} className="rounded bg-primary/10 px-2 py-0.5 text-xs">{l}</span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Template Pesan</h2>

      {grouped.map((group) => (
        <div key={group.type}>
          <h3 className="text-lg font-semibold mb-2 text-muted-foreground">{group.label}</h3>
          <div className="space-y-3">
            {group.items.map((t) => {
              const info = getTemplateInfo(t.key);
              const isExpanded = expanded === t.key;
              const isEditing = editing === t.key;
              const preview = previews[t.key];

              return (
                <div key={t.key} className="rounded-lg border">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : t.key)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.key}</p>
                    </div>
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Event</p>
                          <p>{info.event || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Variabel</p>
                          <p className="font-mono text-xs">{info.vars.length ? info.vars.map((v) => `{{${v}}}`).join(", ") : "Tidak ada"}</p>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs font-medium">Judul</label>
                            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Isi</label>
                            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="w-full rounded-md border px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Tombol (pisahkan dengan koma)</label>
                            <input type="text" value={form.buttonLabels} onChange={(e) => setForm({ ...form, buttonLabels: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Sudah minum, Belum" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => cancelEdit(t)} className="rounded-md border px-3 py-1 text-sm">Batal</button>
                            <button onClick={() => handleSave(t)} disabled={submitting} className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">
                              {submitting ? "Menyimpan..." : "Simpan"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                            <div className="rounded border bg-card p-3 text-sm whitespace-pre-wrap">
                              {preview ? (
                                <>
                                  <p className="font-bold mb-1">{preview.title}</p>
                                  <p>{preview.body}</p>
                                  {renderButtons(preview.buttonLabels)}
                                </>
                              ) : (
                                <>
                                  <p className="font-bold mb-1">{t.title}</p>
                                  <p className="text-muted-foreground">{t.body}</p>
                                  {renderButtons(t.buttonLabels)}
                                </>
                              )}
                            </div>
                          </div>
                          <button onClick={() => startEdit(t)} className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground w-fit">Edit</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
