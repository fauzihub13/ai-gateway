import { db } from './db';

export async function getMaintenance(): Promise<{ enabled: boolean; message: string }> {
  const row = await db.appSetting.findUnique({ where: { key: 'maintenance' } });
  return (row?.value as { enabled: boolean; message: string } | undefined) ?? { enabled: false, message: '' };
}

export async function setMaintenance(enabled: boolean, message = ''): Promise<void> {
  await db.appSetting.upsert({
    where: { key: 'maintenance' },
    create: { key: 'maintenance', value: { enabled, message } },
    update: { value: { enabled, message } },
  });
}