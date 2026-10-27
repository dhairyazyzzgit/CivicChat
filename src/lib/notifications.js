import { supabase } from './supabase';

export function formatBadgeCount(count, max = 99) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n > max) return `${max}+`;
  return String(n);
}

export function isUnread(notification) {
  return Boolean(notification) && notification.read !== true;
}

export async function fetchCitizenNotifications(userId, { limit = 20 } = {}) {
  if (!userId) return { data: [], error: new Error('Not signed in') };

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, group_id, message, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data: Array.isArray(data) ? data : [], error };
}

export async function countUnreadCitizenNotifications(userId) {
  if (!userId) return { count: 0, error: null };

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  return { count: typeof count === 'number' ? count : 0, error };
}

export async function markCitizenNotificationRead(userId, notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .eq('read', false);

  return { error };
}

export async function markAllCitizenNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  return { error };
}

export async function fetchAdminNotifications({ userId, limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('id, group_id, message, category, read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error, usesPersonalReads: false };

  const rows = Array.isArray(data) ? data : [];
  if (!userId || rows.length === 0) {
    return { data: rows, error: null, usesPersonalReads: false };
  }

  const ids = rows.map((row) => row.id);
  const { data: reads, error: readsError } = await supabase
    .from('admin_notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
    .in('notification_id', ids);

  if (readsError) {
    return { data: rows, error: null, usesPersonalReads: false };
  }

  const readIds = new Set((reads || []).map((row) => row.notification_id));
  return {
    data: rows.map((row) => ({ ...row, read: readIds.has(row.id) || row.read === true })),
    error: null,
    usesPersonalReads: true,
  };
}

export async function countUnreadAdminNotifications(userId) {
  const { data, error, usesPersonalReads } = await fetchAdminNotifications({ userId, limit: 100 });
  if (error) return { count: 0, error, usesPersonalReads };
  return {
    count: data.filter((row) => !row.read).length,
    error: null,
    usesPersonalReads,
  };
}

export async function markAdminNotificationRead(userId, notificationId, { usesPersonalReads = false } = {}) {
  if (usesPersonalReads && userId) {
    const { error } = await supabase.from('admin_notification_reads').upsert(
      {
        notification_id: notificationId,
        user_id: userId,
      },
      { onConflict: 'notification_id,user_id' },
    );
    if (!error) return { error: null, usesPersonalReads: true };
  }

  const { error } = await supabase
    .from('admin_notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('read', false);

  return { error, usesPersonalReads: false };
}

export async function markAllAdminNotificationsRead(userId, notifications, { usesPersonalReads = false } = {}) {
  const unread = (notifications || []).filter((row) => !row.read);
  if (unread.length === 0) return { error: null };

  if (usesPersonalReads && userId) {
    const rows = unread.map((row) => ({
      notification_id: row.id,
      user_id: userId,
    }));
    const { error } = await supabase.from('admin_notification_reads').upsert(rows, {
      onConflict: 'notification_id,user_id',
    });
    if (!error) return { error: null };
  }

  const { error } = await supabase.from('admin_notifications').update({ read: true }).eq('read', false);
  return { error };
}

export async function resolveCitizenNotificationPath(userId, groupId) {
  if (!groupId) return '/reports';

  const { data } = await supabase
    .from('reports')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return data?.id ? `/reports/${data.id}` : '/reports';
}
