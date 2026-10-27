import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countUnreadAdminNotifications,
  countUnreadCitizenNotifications,
  fetchAdminNotifications,
  fetchCitizenNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  markAllCitizenNotificationsRead,
  markCitizenNotificationRead,
} from '../lib/notifications';

export function useNotifications({ userId, role }) {
  const isAdmin = role === 'admin';
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const usesPersonalReadsRef = useRef(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      if (isAdmin) {
        const [{ data, error: listError, usesPersonalReads }, badge] = await Promise.all([
          fetchAdminNotifications({ userId, limit: 20 }),
          countUnreadAdminNotifications(userId),
        ]);

        if (requestId !== requestIdRef.current) return;

        if (listError) {
          setError('Could not load notifications. Check your connection and try again.');
          return;
        }

        usesPersonalReadsRef.current = Boolean(usesPersonalReads || badge.usesPersonalReads);
        setNotifications(data);
        setUnreadCount(typeof badge.count === 'number' ? badge.count : data.filter((n) => !n.read).length);
        setError(null);
        return;
      }

      const [{ data, error: listError }, badge] = await Promise.all([
        fetchCitizenNotifications(userId, { limit: 20 }),
        countUnreadCitizenNotifications(userId),
      ]);

      if (requestId !== requestIdRef.current) return;

      if (listError) {
        setError('Could not load notifications. Check your connection and try again.');
        return;
      }

      setNotifications(data);
      setUnreadCount(typeof badge.count === 'number' ? badge.count : data.filter((n) => !n.read).length);
      setError(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError('Could not load notifications. Check your connection and try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    refresh();

    if (!userId) return undefined;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, 30_000);

    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh, userId]);

  const markOneRead = useCallback(
    async (notification) => {
      if (!userId || !notification?.id || notification.read) return;

      setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));

      const result = isAdmin
        ? await markAdminNotificationRead(userId, notification.id, {
            usesPersonalReads: usesPersonalReadsRef.current,
          })
        : await markCitizenNotificationRead(userId, notification.id);

      if (result.error) {
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, read: false } : item)),
        );
        setUnreadCount((prev) => prev + 1);
        setError('Could not mark that notification as read. Please try again.');
      }
    },
    [isAdmin, userId],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unread = notifications.filter((item) => !item.read);
    if (unread.length === 0) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);

    const result = isAdmin
      ? await markAllAdminNotificationsRead(userId, unread, {
          usesPersonalReads: usesPersonalReadsRef.current,
        })
      : await markAllCitizenNotificationsRead(userId);

    if (result.error) {
      setNotifications((prev) =>
        prev.map((item) => (unread.some((u) => u.id === item.id) ? { ...item, read: false } : item)),
      );
      setUnreadCount(unread.length);
      setError('Could not mark notifications as read. Please try again.');
    }
  }, [isAdmin, notifications, userId]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markOneRead,
    markAllRead,
    isAdmin,
  };
}
