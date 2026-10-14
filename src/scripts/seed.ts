import { createRole, readRoles } from '@directus/sdk';
import { createAdminDirectusClient } from '../services/directus.client.js';
import { config } from '../config/env.js';

export async function seedDirectusRoles() {
  if (!config.directusAdminToken) {
    console.warn('⚠️ DIRECTUS_ADMIN_TOKEN is not set. Skipping Directus role provisioning.');
    return;
  }

  console.log(`Connecting to Directus at ${config.directusUrl}...`);
  const adminClient = createAdminDirectusClient();

  try {
    const existingRoles = await adminClient.request(readRoles({
      fields: ['id', 'name'],
    })) as Array<{ id: string; name: string }>;

    const roleNames = existingRoles.map(r => r.name);
    console.log(`Existing roles in Directus: ${roleNames.join(', ')}`);

    // Ensure default Member role exists
    if (!roleNames.includes(config.defaultMemberRoleName)) {
      console.log(`Creating default '${config.defaultMemberRoleName}' role...`);
      await adminClient.request(createRole({
        name: config.defaultMemberRoleName,
        icon: 'person',
        description: 'Standard registered application user',
      }));
      console.log(`✅ Role '${config.defaultMemberRoleName}' created.`);
    } else {
      console.log(`✓ Role '${config.defaultMemberRoleName}' already exists.`);
    }

    // Ensure Service Accounts role exists
    if (!roleNames.includes(config.serviceRoleName)) {
      console.log(`Creating '${config.serviceRoleName}' role...`);
      await adminClient.request(createRole({
        name: config.serviceRoleName,
        icon: 'smart_toy',
        description: 'Automated service accounts (Hermes AI, n8n)',
      }));
      console.log(`✅ Role '${config.serviceRoleName}' created.`);
    } else {
      console.log(`✓ Role '${config.serviceRoleName}' already exists.`);
    }

    // Re-read roles to acquire member role ID
    const updatedRoles = await adminClient.request(readRoles({
      fields: ['id', 'name'],
    })) as Array<{ id: string; name: string }>;

    const memberRole = updatedRoles.find(r => r.name === config.defaultMemberRoleName);
    const serviceRole = updatedRoles.find(r => r.name === config.serviceRoleName);

    console.log('\n--- Directus SSO Role Mapping Configuration ---');
    console.log(`Member Role ID:          ${memberRole?.id || 'unknown'}`);
    console.log(`Service Accounts Role ID: ${serviceRole?.id || 'unknown'}`);
    console.log('\nCopy the following into /root/directus/docker-compose.yml:');
    console.log(`AUTH_GOOGLE_DEFAULT_ROLE_ID: "${memberRole?.id || ''}"`);
    console.log(`AUTH_GITHUB_DEFAULT_ROLE_ID: "${memberRole?.id || ''}"`);
    console.log('------------------------------------------------\n');

    console.log('🎉 Role provisioning completed successfully.');
  } catch (error: any) {
    console.error('❌ Failed to provision roles:', error?.message || error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  seedDirectusRoles();
}
