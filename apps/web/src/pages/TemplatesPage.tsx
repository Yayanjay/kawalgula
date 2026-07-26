import { useEffect, useState, useMemo } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";

interface Template {
  key: string;
  type: string;
  title: string;
  body: string;
}

const typeLabels: Record<string, string> = {
  enrollment: "Pendaftaran",
  reminder: "Pengingat",
  optin_confirm: "Konfirmasi Setuju",
  usage_hint: "Bantuan",
  already_opted_in: "Sudah Terdaftar",
  confirmation: "Konfirmasi",
};

const typeColors: Record<string, string> = {
  reminder: "bg-blue-100 text-blue-700",
  confirmation: "bg-green-100 text-green-700",
  enrollment: "bg-purple-100 text-purple-700",
  optin_confirm: "bg-teal-100 text-teal-700",
  usage_hint: "bg-gray-100 text-gray-700",
  already_opted_in: "bg-amber-100 text-amber-700",
};

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

const allTypes = ["reminder", "confirmation", "enrollment", "optin_confirm", "usage_hint", "already_opted_in"];

const sampleVars: Record<string, string> = {
  name: "Budi",
  medication_name: "Metformin",
  dosage: "500mg",
  unit: "tablet",
  token: "abc12345",
};

function renderPreview(text: string): string {
  let result = text;
  for (const [k, v] of Object.entries(sampleVars)) {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return result;
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
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

  const filtered = useMemo(() => {
    let items = templates;
    if (filterType) items = items.filter((t) => t.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((t) => t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q));
    }
    return items;
  }, [templates, filterType, search]);

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ title: t.title, body: t.body });
  };

  const closeEdit = () => {
    setEditing(null);
    setForm({ title: "", body: "" });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSubmitting(true);
    try {
      await api.patch(`/templates/${editing.key}`, { title: form.title, body: form.body });
      await fetchTemplates();
      closeEdit();
      toast("Template disimpan");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal menyimpan", "error");
    }
    setSubmitting(false);
  };

  const livePreview = useMemo(() => {
    if (!editing) return null;
    return { title: form.title, body: renderPreview(form.body) };
  }, [editing, form]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-bold">Template Pesan</h2>
        <input
          type="text"
          placeholder="Cari template..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm w-64"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterType(null)}
          className={`rounded-full px-4 py-1 text-sm border transition-colors ${!filterType ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
        >
          Semua
        </button>
        {allTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type === filterType ? null : type)}
            className={`rounded-full px-4 py-1 text-sm border transition-colors ${filterType === type ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {typeLabels[type] || type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => {
          const info = getTemplateInfo(t.key);
          return (
            <div key={t.key} className="rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="p-4 space-y-3">
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[t.type] || "bg-gray-100 text-gray-700"}`}>
                    {typeLabels[t.type] || t.type}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">{t.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.key}</p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{info.event}</p>
                {info.vars.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {info.vars.map((v) => (
                      <span key={v} className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">{`{{${v}}}`}</span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => openEdit(t)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!filtered.length && (
        <p className="text-sm text-muted-foreground text-center py-12">Tidak ada template ditemukan</p>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12">
          <div className="fixed inset-0 bg-black/50" onClick={closeEdit} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4 m-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Edit Template</h3>
              <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[editing.type] || ""}`}>{typeLabels[editing.type] || editing.type}</span>
              {" — "}{editing.key}
            </p>

            <div>
              <label className="text-xs font-medium block mb-0.5">Judul</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium block mb-0.5">Isi Pesan</label>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={6} className="w-full rounded-md border px-3 py-2 text-sm font-mono text-xs" />
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 max-w-sm mx-auto text-sm">
                {livePreview && (
                  <>
                    <p className="font-bold mb-1">{livePreview.title}</p>
                    <p className="whitespace-pre-wrap">{livePreview.body}</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeEdit} className="rounded-md border px-4 py-2 text-sm">Batal</button>
              <button onClick={handleSave} disabled={submitting} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {submitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
