import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const db = new PrismaClient();

async function main() {
  const plans = [
    { name: 'basic', displayName: 'Basic', markup: 1.5, rpmLimit: 60, monthlyTokenLimit: 5_000_000, monthlyPriceIdr: 0 },
    { name: 'pro', displayName: 'Pro', markup: 1.35, rpmLimit: 300, monthlyTokenLimit: 50_000_000, monthlyPriceIdr: 199_000 },
    { name: 'enterprise', displayName: 'Enterprise', markup: 1.2, rpmLimit: 1200, monthlyTokenLimit: null, monthlyPriceIdr: 999_000 },
  ];
  for (const p of plans) {
    await db.plan.upsert({ where: { name: p.name }, create: p, update: p });
  }

  const models = [
    { publicName: 'gpt-4o', internalName: 'gh/gpt-4o', displayName: 'GPT-4o', contextWindow: 128_000, priceInPer1kIdr: 4, priceOutPer1kIdr: 12, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
    { publicName: 'gpt-4o-mini', internalName: 'gh/gpt-4o-mini', displayName: 'GPT-4o mini', contextWindow: 128_000, priceInPer1kIdr: 1, priceOutPer1kIdr: 3, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
    { publicName: 'claude-sonnet-4.5', internalName: 'kr/claude-sonnet-4.5', displayName: 'Claude Sonnet 4.5', contextWindow: 200_000, priceInPer1kIdr: 5, priceOutPer1kIdr: 18, capabilities: { stream: true, vision: true, tools: true } },
    { publicName: 'gemini-1.5-pro', internalName: 'gm/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 1_000_000, priceInPer1kIdr: 3, priceOutPer1kIdr: 10, capabilities: { stream: true, vision: true, tools: true } },
  ];
  for (const m of models) {
    await db.model.upsert({ where: { publicName: m.publicName }, create: m, update: m });
  }

  const basic = await db.plan.findUniqueOrThrow({ where: { name: 'basic' } });
  const pro = await db.plan.findUniqueOrThrow({ where: { name: 'pro' } });
  const ent = await db.plan.findUniqueOrThrow({ where: { name: 'enterprise' } });
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
  await link(basic.id, ['gpt-4o-mini']);
  await link(pro.id, ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4.5']);
  await link(ent.id);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@mpruy.ai';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe!123';

  await db.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: 'ADMIN',
      status: 'ACTIVE',
      planId: ent.id,
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
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
}

main().finally(() => db.$disconnect());