import { prisma } from './client';
import { SubscriptionTier } from '@prisma/client';

async function main() {
  console.log('Seeding database...');

  const business = await prisma.business.upsert({
    where: { id: 'biz_demo_001' },
    update: {},
    create: {
      id: 'biz_demo_001',
      name: 'QuickDelivery NG',
      industry: 'logistics',
      subscriptionTier: SubscriptionTier.GROWTH,
      phoneNumbers: {
        create: { number: '+2348012345678' },
      },
      knowledgeBase: {
        create: {
          businessName: 'QuickDelivery NG',
          operatingHours: {
            weekdays: '08:00–20:00',
            saturday: '09:00–18:00',
            sunday: 'closed',
          },
          faqs: [
            {
              question: 'How much does delivery to Lekki cost?',
              answer: 'Delivery to Lekki Phase 1 and 2 is ₦4,500. Island Express locations are ₦3,800.',
            },
            {
              question: 'How long does delivery take?',
              answer: 'Same-day delivery within Lagos. Inter-state takes 1–3 business days.',
            },
          ],
          escalationNumber: '+2348087654321',
        },
      },
      users: {
        create: {
          email: 'owner@quickdelivery.ng',
          password: '$2b$10$placeholder_hashed_password',
          role: 'OWNER',
        },
      },
    },
  });

  console.log(`Seeded demo business: ${business.name} (${business.id})`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
