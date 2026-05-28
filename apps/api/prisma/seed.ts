/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from '@logisti-core/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding LogistiCore demo data...');

  // ── Roles ────────────────────────────────────────────────────
  for (const key of ALL_ROLES) {
    await prisma.role.upsert({
      where: { key },
      update: { description: ROLE_DESCRIPTIONS[key] },
      create: {
        key,
        name: key
          .split('_')
          .map((s) => s[0]?.toUpperCase() + s.slice(1))
          .join(' '),
        description: ROLE_DESCRIPTIONS[key],
        isSystem: true,
      },
    });
  }
  console.log(`  ✓ ${ALL_ROLES.length} roles`);

  // ── Permissions ──────────────────────────────────────────────
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  console.log(`  ✓ ${ALL_PERMISSIONS.length} permissions`);

  // ── Role → Permission mapping ────────────────────────────────
  for (const roleKey of ALL_ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const perms = ROLE_PERMISSIONS[roleKey];
    for (const permKey of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log('  ✓ role→permission map');

  // ── Tenant ───────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-logistics' },
    update: {},
    create: {
      name: 'Demo Logistics',
      slug: 'demo-logistics',
      currency: 'HKD',
      timezone: 'Asia/Hong_Kong',
    },
  });
  console.log(`  ✓ tenant: ${tenant.name}`);

  // ── Branches ─────────────────────────────────────────────────
  const branchSeed = [
    {
      code: 'HK-MAIN',
      name: 'Hong Kong Main',
      region: 'HK',
      timezone: 'Asia/Hong_Kong',
      address: 'To Kwa Wan, Kowloon, HK',
    },
    {
      code: 'MNL-MAIN',
      name: 'Manila Main',
      region: 'PH',
      timezone: 'Asia/Manila',
      address: 'Pasay City, Metro Manila, PH',
    },
  ];
  const branches = [];
  for (const b of branchSeed) {
    branches.push(
      await prisma.branch.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: b.code } },
        update: {},
        create: { ...b, tenantId: tenant.id },
      }),
    );
  }
  console.log(`  ✓ ${branches.length} branches`);

  // ── Warehouses → Zones → Racks → Bins ────────────────────────
  let zoneCount = 0;
  let rackCount = 0;
  let binCount = 0;
  for (const branch of branches) {
    const warehouse = await prisma.warehouse.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: `${branch.code}-WH1` } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        code: `${branch.code}-WH1`,
        name: `${branch.name} Warehouse 1`,
        address: branch.address,
      },
    });

    for (const zCode of ['ZONE-A', 'ZONE-B']) {
      const zone = await prisma.warehouseZone.upsert({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: zCode } },
        update: {},
        create: {
          tenantId: tenant.id,
          warehouseId: warehouse.id,
          code: zCode,
          name: `${warehouse.name} ${zCode}`,
        },
      });
      zoneCount += 1;

      for (const rIdx of [1, 2]) {
        const rCode = `R${rIdx}`;
        const rack = await prisma.rack.upsert({
          where: { zoneId_code: { zoneId: zone.id, code: rCode } },
          update: {},
          create: {
            tenantId: tenant.id,
            zoneId: zone.id,
            code: rCode,
            rows: 2,
            columns: 2,
          },
        });
        rackCount += 1;

        for (const bIdx of [1, 2]) {
          const bCode = `B${bIdx}`;
          await prisma.bin.upsert({
            where: { rackId_code: { rackId: rack.id, code: bCode } },
            update: {},
            create: {
              tenantId: tenant.id,
              rackId: rack.id,
              code: bCode,
              capacity: 100,
            },
          });
          binCount += 1;
        }
      }
    }
  }
  console.log(`  ✓ ${zoneCount} zones, ${rackCount} racks, ${binCount} bins`);

  // ── Super-admin user ─────────────────────────────────────────
  const email = (process.env['SEED_SUPERADMIN_EMAIL'] ?? 'admin@logisti-core.local').toLowerCase();
  const password = process.env['SEED_SUPERADMIN_PASSWORD'] ?? 'ChangeMe!Now-2026';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { key: ROLES.SUPER_ADMIN },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_emailNormalized: { tenantId: tenant.id, emailNormalized: email } },
    update: { passwordHash },
    create: {
      tenantId: tenant.id,
      email,
      emailNormalized: email,
      name: 'Super Admin',
      passwordHash,
      isActive: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });
  console.log(`  ✓ super admin: ${email}`);

  // ── Master user (alphabyte.master) ───────────────────────────
  // The "master" is a privileged account that can:
  //   - assume any role for the current session (impersonation for testing)
  //   - switch branch context across all branches
  //   - assign/revoke roles on other users
  // All actions remain audited.
  const masterEmail = (
    process.env['SEED_MASTER_EMAIL'] ?? 'alphabyte.master@logisti-core.local'
  ).toLowerCase();
  const masterPassword = process.env['SEED_MASTER_PASSWORD'] ?? 'AlphabyteMaster!2026';
  const masterHash = await argon2.hash(masterPassword, { type: argon2.argon2id });

  const master = await prisma.user.upsert({
    where: { tenantId_emailNormalized: { tenantId: tenant.id, emailNormalized: masterEmail } },
    update: { passwordHash: masterHash, isMaster: true },
    create: {
      tenantId: tenant.id,
      email: masterEmail,
      emailNormalized: masterEmail,
      name: 'Alphabyte Master',
      passwordHash: masterHash,
      isActive: true,
      isMaster: true,
    },
  });
  // Master gets every role attached so impersonation always works.
  for (const roleKey of ALL_ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: master.id, roleId: role.id } },
      update: {},
      create: { userId: master.id, roleId: role.id },
    });
  }
  console.log(`  ✓ master:      ${masterEmail}  (all roles, all branches)`);

  // ── A few more demo users ────────────────────────────────────
  const demoUsers: Array<{ email: string; name: string; role: string; branchCode: string }> = [
    {
      email: 'wh.admin@logisti-core.local',
      name: 'Warehouse Admin',
      role: ROLES.WAREHOUSE_ADMIN,
      branchCode: 'HK-MAIN',
    },
    {
      email: 'wh.staff@logisti-core.local',
      name: 'Warehouse Staff',
      role: ROLES.WAREHOUSE_STAFF,
      branchCode: 'HK-MAIN',
    },
    {
      email: 'dispatcher@logisti-core.local',
      name: 'Dispatcher',
      role: ROLES.DISPATCHER,
      branchCode: 'MNL-MAIN',
    },
    {
      email: 'driver@logisti-core.local',
      name: 'Driver',
      role: ROLES.DRIVER,
      branchCode: 'MNL-MAIN',
    },
    {
      email: 'inventory@logisti-core.local',
      name: 'Inventory Manager',
      role: ROLES.INVENTORY_MANAGER,
      branchCode: 'HK-MAIN',
    },
    {
      email: 'viewer@logisti-core.local',
      name: 'Viewer',
      role: ROLES.VIEWER,
      branchCode: 'HK-MAIN',
    },
  ];
  const demoPassword = 'DemoUser!Pass-2026';
  const demoHash = await argon2.hash(demoPassword, { type: argon2.argon2id });
  for (const d of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: d.role } });
    const branch = branches.find((b) => b.code === d.branchCode);
    const user = await prisma.user.upsert({
      where: {
        tenantId_emailNormalized: {
          tenantId: tenant.id,
          emailNormalized: d.email.toLowerCase(),
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        email: d.email,
        emailNormalized: d.email.toLowerCase(),
        name: d.name,
        passwordHash: demoHash,
        branchId: branch?.id,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  console.log(`  ✓ ${demoUsers.length} demo users (password: ${demoPassword})`);

  console.log('\n✅ Seed complete.\n');
  console.log(`   Master:      ${masterEmail} / ${masterPassword}`);
  console.log(`   Super admin: ${email} / ${password}`);
  console.log(`   Demo users:  *@logisti-core.local / ${demoPassword}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
