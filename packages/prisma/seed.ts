import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.admin.upsert({
    where: { email: "admin@puskesmas.local" },
    update: {},
    create: {
      email: "admin@puskesmas.local",
      passwordHash,
      name: "Admin Puskesmas",
      role: "superadmin",
    },
  });

  const templates = [
    {
      type: "enrollment" as const,
      key: "enrollment",
      title: "Program Pemantauan Obat DM",
      body: "Halo {{name}},\n\nAnda telah didaftarkan dalam program pemantauan konsumsi obat DM oleh Puskesmas. Apakah Anda bersedia untuk mengikuti program ini?\n\nBalas \"setuju\" untuk mendaftar atau \"nanti\" untuk menunda.",
    },
    {
      type: "reminder" as const,
      key: "reminder",
      title: "Pengingat Minum Obat",
      body: "Halo {{name}},\n\nSaatnya minum obat {{medication_name}} dosis {{dosage}} {{unit}}.\n\nApakah Anda sudah meminum obat?\n\nBalas \"sudah\" jika sudah minum, \"belum\" jika belum.",
    },
    {
      type: "optin_confirm" as const,
      key: "optin_confirm",
      title: "Pendaftaran Berhasil",
      body: "Terima kasih {{name}}, Anda telah terdaftar dalam program pemantauan konsumsi obat DM. Anda akan menerima pengingat sesuai jadwal pengobatan.\n\nJika ada pertanyaan, silakan hubungi Puskesmas.",
    },
    {
      type: "usage_hint" as const,
      key: "usage_hint",
      title: "Cara Membalas",
      body: "Balas dengan kata kunci:\n- *Sudah* atau *Minum* jika sudah minum obat\n- *Belum* atau *Lewati* jika belum minum obat\n\nAtau gunakan tombol yang tersedia pada pesan pengingat.",
    },
    {
      type: "already_opted_in" as const,
      key: "already_opted_in",
      title: "Sudah Terdaftar",
      body: "Halo {{name}}, Anda sudah terdaftar dalam program pemantauan konsumsi obat DM. Anda akan menerima pengingat sesuai jadwal pengobatan.",
    },
    {
      type: "confirmation" as const,
      key: "taken_confirm",
      title: "Konfirmasi Minum",
      body: "Tercatat. Terima kasih.",
    },
    {
      type: "confirmation" as const,
      key: "belum_retry",
      title: "Konfirmasi Belum (ulang)",
      body: "{{name}}, tercatat. Kami akan mengingatkan lagi nanti.",
    },
    {
      type: "confirmation" as const,
      key: "belum_exhausted",
      title: "Konfirmasi Lewati",
      body: "{{name}}, baik, dicatat sebagai lewati untuk jadwal ini.",
    },
    {
      type: "enrollment" as const,
      key: "wa_prefill",
      title: "Isi Otomatis WA",
      body: "Halo KawalGula, saya ingin mengikuti program DM tracker {{token}}",
    },
  ];

  for (const template of templates) {
    await prisma.templateMessage.upsert({
      where: { key: template.key },
      update: template,
      create: { ...template, createdById: "SYSTEM" },
    });
  }

  const params = [
    {
      key: "reminder_max_retries",
      value: "3",
      name: "Maksimal percobaan ulang pengingat",
    },
    {
      key: "reminder_retry_interval_minutes",
      value: "30",
      name: "Interval percobaan ulang (menit)",
    },
  ];

  for (const param of params) {
    await prisma.generalParameter.upsert({
      where: { key: param.key },
      update: param,
      create: param,
    });
  }

  console.log("Seed completed: admin + default template messages + general parameters created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
