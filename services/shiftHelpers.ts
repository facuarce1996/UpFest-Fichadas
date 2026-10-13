import { LogEntry } from '../types';

export const formatMinutes = (mins: number): string => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

export const getShiftDuration = (log: LogEntry, logList: LogEntry[]): number | null => {
  if (log.type !== 'CHECK_OUT') return null;
  const userLogsInOrder = [...logList]
    .filter(l => l.userId === log.userId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const currentIndex = userLogsInOrder.findIndex(l => l.id === log.id);
  if (currentIndex <= 0) return null;

  const previousLog = userLogsInOrder[currentIndex - 1];
  if (previousLog.type === 'CHECK_IN') {
    const diff = new Date(log.timestamp).getTime() - new Date(previousLog.timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    return mins > 0 ? mins : null;
  }
  return null;
};

export const getNoExitLogs = (adminLogs: LogEntry[]): LogEntry[] => {
  return adminLogs.filter(log => {
    if (log.type !== 'CHECK_IN') return false;
    const userLogs = adminLogs
      .filter(l => l.userId === log.userId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const idx = userLogs.findIndex(l => l.id === log.id);
    const nextLog = userLogs[idx + 1];
    const isOld = (new Date().getTime() - new Date(log.timestamp).getTime()) > 20 * 60 * 60 * 1000;
    return (nextLog && nextLog.type === 'CHECK_IN') || (!nextLog && isOld);
  });
};
