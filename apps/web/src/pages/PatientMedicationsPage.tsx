import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import { Plus, Trash2, Bell } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import EnrollmentQr from "../components/EnrollmentQr";

interface MasterMedication {
  id: string;
  name: string;
  dosage: string;
  unit: string;
}

interface Assignment {
  id: string;
  medication: MasterMedication;
  scheduleTimes: string[];
  active: boolean;
}

interface Patient {
  id: string;
  name: string;
}

export default function PatientMedicationsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [masterMeds, setMasterMeds] = useState<MasterMedication[]>([]);
  const [selectedMedId, setSelectedMedId] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [patientRes, assignRes, masterRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.post("/patient-medications/list", { page: 1, size: 50, patientId: id }),
        api.post("/medications/list", { page: 1, size: 200 }),
      ]);
      setPatient(patientRes.data.data);
      setAssignments(assignRes.data.data);
      setMasterMeds(masterRes.data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const resetForm = () => {
    setSelectedMedId("");
    setScheduleInput("");
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedId) return;
    setSubmitting(true);
    const times = scheduleInput.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      if (editing) {
        await api.patch(`/patient-medications/${editing.id}`, { scheduleTimes: times });
        toast("Jadwal diperbarui");
      } else {
        await api.post("/patient-medications", { patientId: id, medicationId: selectedMedId, scheduleTimes: times });
        toast("Obat ditambahkan");
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
    setSubmitting(false);
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      await api.delete(`/patient-medications/${assignmentId}`);
      fetchData();
      toast("Obat dihapus");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  const handleSendNow = async (assignmentId: string) => {
    try {
      const res = await api.post("/reminders/send-now", { patientMedicationId: assignmentId });
      toast(res.data?.data?.message || "Pengingat dikirim");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  const handleEdit = (a: Assignment) => {
    setEditing(a);
    setSelectedMedId(a.medication.id);
    setScheduleInput(a.scheduleTimes.join(", "));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Obat {patient?.name || "..."}</h2>
          <p className="text-sm text-muted-foreground">Pilih obat dari daftar dan atur jadwal</p>
        </div>
      </div>

      {id && <EnrollmentQr patientId={id} />}

      <form onSubmit={handleSubmit} className="flex items-end gap-3 rounded-lg border p-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Obat</label>
          <select
            value={selectedMedId}
            onChange={(e) => setSelectedMedId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            disabled={!!editing}
          >
            <option value="">-- Pilih Obat --</option>
            {masterMeds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.dosage} {m.unit}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Jadwal WIB (pisahkan dengan koma)</label>
          <input
            type="text"
            value={scheduleInput}
            onChange={(e) => setScheduleInput(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="08:00, 20:00"
            required
          />
        </div>
        <div className="flex gap-2">
          {editing && (
            <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm">
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !selectedMedId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "..." : editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {assignments.filter((a) => a.active).length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada obat</p>
        )}
        {assignments.filter((a) => a.active).map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{a.medication.name} {a.medication.dosage} {a.medication.unit}</p>
              <p className="text-sm text-muted-foreground">
                Jadwal: {a.scheduleTimes.join(", ")} WIB
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleSendNow(a.id)} className="rounded p-1 hover:bg-muted" title="Kirim pengingat">
                <Bell className="h-4 w-4" />
              </button>
              <button onClick={() => handleEdit(a)} className="rounded p-1 hover:bg-muted text-sm">Edit</button>
              <button onClick={() => setConfirmDelete(a.id)} className="rounded p-1 hover:bg-muted text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Hapus Obat"
        message="Hapus obat ini? Pengingat akan dihapus, log konsumsi tetap tersimpan."
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
