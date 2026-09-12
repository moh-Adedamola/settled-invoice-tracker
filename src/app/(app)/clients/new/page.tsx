import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { ClientForm } from '@/components/clients/client-form';
import { PageHeader } from '@/components/shell/page-header';

import { createClient } from '../actions';

export const metadata: Metadata = { title: 'New client · Settled' };
export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  await requireUser();
  // A viewer reaching this URL is sent back rather than shown a form that will
  // refuse them. assertCanWrite in the action is what protects the write.
  if (await isReadOnly()) redirect('/clients');

  return (
    <>
      <PageHeader
        eyebrow="New"
        title="New client"
        description="Only a name is required. Everything else can be filled in later."
      />
      <div className="px-6 py-6">
        <ClientForm
          action={createClient}
          submitLabel="Create client"
          cancelHref="/clients"
          initial={{ name: '', email: '', phone: '', notes: '' }}
        />
      </div>
    </>
  );
}
