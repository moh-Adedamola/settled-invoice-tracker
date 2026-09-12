import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getClient } from '@/lib/queries/clients';
import { ClientForm } from '@/components/clients/client-form';
import { PageHeader } from '@/components/shell/page-header';

import { updateClient } from '../../actions';

export const metadata: Metadata = { title: 'Edit client · Settled' };
export const dynamic = 'force-dynamic';

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  if (await isReadOnly()) redirect('/clients');

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/clients/${client.id}`}
            className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline"
          >
            ← {client.name}
          </Link>
        }
        title={client.name}
        description={
          client.archivedAt
            ? 'This client is archived. Editing them here does not restore them.'
            : undefined
        }
      />
      <div className="px-6 py-6">
        <ClientForm
          action={updateClient}
          clientId={client.id}
          submitLabel="Save client"
          cancelHref={`/clients/${client.id}`}
          initial={{
            name: client.name,
            email: client.email ?? '',
            phone: client.phone ?? '',
            notes: client.notes ?? '',
          }}
        />
      </div>
    </>
  );
}
