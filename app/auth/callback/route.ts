import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

function safeDestination(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const destination = safeDestination(url.searchParams.get('next'));

  if (!code) {
    const redirect = new URL('/', url.origin);
    redirect.searchParams.set('auth_error', 'missing_code');
    return NextResponse.redirect(redirect);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const redirect = new URL('/', url.origin);
    redirect.searchParams.set('auth_error', 'exchange_failed');
    return NextResponse.redirect(redirect);
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
