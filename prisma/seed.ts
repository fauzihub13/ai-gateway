import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const db = new PrismaClient();

async function main() {
  const plans = [
    // Plan gratis adalah tier default untuk user baru (lihat src/lib/plans.ts).
    { name: 'free', displayName: 'Free', markup: 1, rpmLimit: 100, monthlyTokenLimit: 20_000_000, monthlyPriceIdr: 0 },
  ];
  for (const p of plans) {
    await db.plan.upsert({ where: { name: p.name }, create: p, update: p });
  }

  const models = [
    { publicName: 'mimo', internalName: 'mimo-free', displayName: 'MiMo', contextWindow: 1_048_576, maxOutputTokens: 131_072, priceInPer1MIdr: 4_000, priceOutPer1MIdr: 12_000, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
  ];
  for (const m of models) {
    await db.model.upsert({ where: { publicName: m.publicName }, create: m, update: m });
  }

  const free = await db.plan.findUniqueOrThrow({ where: { name: 'free' } });
  const allModels = await db.model.findMany();

  const link = async (planId: string, subset?: string[]) => {
    const list = subset ? allModels.filter((m) => subset.includes(m.publicName)) : allModels;
    for (const m of list) {
      await db.planModel.upsert({
        where: { planId_modelId: { planId, modelId: m.id } },
        create: { planId, modelId: m.id },
        update: {},
      });
    }
  };
  // Hanya ada satu plan: free, dengan akses ke seluruh model yang di-seed.
  await link(free.id);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@mpruy.ai';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe!123';

  await db.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: 'ADMIN',
      status: 'ACTIVE',
      planId: free.id,
      balance: 0,
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  await db.appSetting.upsert({
    where: { key: 'maintenance' },
    create: { key: 'maintenance', value: { enabled: false, message: '' } },
    update: {},
  });

  console.log('Seed selesai.');
  console.log(`Plans: ${plans.map((p) => p.name).join(', ')} (default signup: free)`);
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
}

main().finally(() => db.$disconnect());