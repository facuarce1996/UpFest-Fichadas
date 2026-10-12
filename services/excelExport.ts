import { formatInTimeZone } from 'date-fns-tz';
import { LogEntry, User, WorkSchedule, DAYS_OF_WEEK } from '../types';
import { formatMinutes } from './shiftHelpers';

const ARG_TZ = 'America/Argentina/Buenos_Aires';

export const exportAttendanceReport = async (adminLogs: LogEntry[], allUsers: User[]): Promise<void> => {
  const XLSX = await import('xlsx');

  const userMap = new Map<string, LogEntry[]>();
  adminLogs.forEach(log => {
    const userLogs = userMap.get(log.userId) || [];
    userLogs.push(log);
    userMap.set(log.userId, userLogs);
  });

  const reportData: any[] = [];

  userMap.forEach((logs) => {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const userObj = allUsers.find(u => u.id === current.userId);
      const userDni = userObj?.dni || current.legajo;
      const rawTime = new Date(current.timestamp).getTime();
      
      if (current.type === 'CHECK_IN') {
        const next = sorted[i + 1];
        if (next && next.type === 'CHECK_OUT') {
          const startMs = new Date(current.timestamp).getTime();
          const endMs = new Date(next.timestamp).getTime();
          const diffMs = endMs - startMs;
          const diffMins = Math.round(diffMs / 60000);

          reportData.push({
            _rawTimestamp: rawTime,
            'DNI': userDni,
            'NOMBRE': current.userName,
            'FECHA INGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'dd/MM/yyyy'),
            'HORA INGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'HH:mm'),
            'FECHA EGRESO': formatInTimeZone(next.timestamp, ARG_TZ, 'dd/MM/yyyy'),
            'HORA EGRESO': formatInTimeZone(next.timestamp, ARG_TZ, 'HH:mm'),
            'MINUTOS TRABAJADOS': diffMins,
            'DURACION': formatMinutes(diffMins),
            'VALIDA VESTIMENTA': current.dressCodeStatus === 'PASS' ? 'SI' : (current.dressCodeStatus === 'FAIL' ? 'NO' : 'NO APLICA'),
            'SEDE': current.locationName,
            'DESCRIPCION IA': current.aiFeedback
          });
          i++; 
        } else {
          reportData.push({
            _rawTimestamp: rawTime,
            'DNI': userDni,
            'NOMBRE': current.userName,
            'FECHA INGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'dd/MM/yyyy'),
            'HORA INGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'HH:mm'),
            'FECHA EGRESO': '---',
            'HORA EGRESO': '---',
            'MINUTOS TRABAJADOS': 0,
            'DURACION': 'Sin egreso',
            'VALIDA VESTIMENTA': current.dressCodeStatus === 'PASS' ? 'SI' : (current.dressCodeStatus === 'FAIL' ? 'NO' : 'NO APLICA'),
            'SEDE': current.locationName,
            'DESCRIPCION IA': current.aiFeedback
          });
        }
      } else if (current.type === 'CHECK_OUT') {
        reportData.push({
          _rawTimestamp: rawTime,
          'DNI': userDni,
          'NOMBRE': current.userName,
          'FECHA INGRESO': '---',
          'HORA INGRESO': '---',
          'FECHA EGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'dd/MM/yyyy'),
          'HORA EGRESO': formatInTimeZone(current.timestamp, ARG_TZ, 'HH:mm'),
          'MINUTOS TRABAJADOS': 0,
          'DURACION': 'Sin ingreso',
          'VALIDA VESTIMENTA': 'NO',
          'SEDE': current.locationName,
          'DESCRIPCION IA': 'Egreso registrado sin ingreso previo'
        });
      }
    }
  });

  // Ordenar por fecha/hora real usando el timestamp numérico
  reportData.sort((a, b) => b._rawTimestamp - a._rawTimestamp);

  // Limpiar _rawTimestamp para el Excel
  const cleanedReportData = reportData.map(({ _rawTimestamp, ...row }) => row);

  const ws = XLSX.utils.json_to_sheet(cleanedReportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fichadas UpFest");
  const todayArgentina = formatInTimeZone(new Date(), ARG_TZ, 'yyyy-MM-dd');
  XLSX.writeFile(wb, `Reporte_Asistencia_UpFest_${todayArgentina}.xlsx`);
};

export const exportUsersReport = async (users: User[]): Promise<void> => {
  const XLSX = await import('xlsx');
  const usersToExport = users.map(user => ({
    'Nombre Completo': user.name,
    'DNI': user.dni,
    'Legajo': user.legajo,
    'Rol': user.role,
  }));

  const ws = XLSX.utils.json_to_sheet(usersToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
  XLSX.writeFile(wb, 'nomina_upfest_control.xlsx');
};

export const exportTemplateRRHH = async (): Promise<void> => {
  const XLSX = await import('xlsx');
  const headers = [
    "Nombre", "DNI", "Legajo", "Rol", "Vestimenta",
    "Lunes_Inicio", "Lunes_Fin",
    "Martes_Inicio", "Martes_Fin",
    "Miercoles_Inicio", "Miercoles_Fin",
    "Jueves_Inicio", "Jueves_Fin",
    "Viernes_Inicio", "Viernes_Fin",
    "Sabado_Inicio", "Sabado_Fin",
    "Domingo_Inicio", "Domingo_Fin"
  ];
  const exampleRow = [
    "Juan Pérez", "12345678", "LEG-001", "Mozo", "Camisa negra lisa",
    "18:00", "02:00",
    "", "",
    "", "",
    "", "",
    "20:00", "04:00",
    "20:00", "04:00",
    "", ""
  ];
  const data = [headers, exampleRow];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla_RRHH");
  XLSX.writeFile(wb, "UpFest_Plantilla_RRHH.xlsx");
};

export const parseExcelUsers = async (file: File): Promise<{ users: User[]; convertedAdminCount: number }> => {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        
        let convertedAdminCount = 0;
        const users: User[] = [];

        for (const row of (rawData as any[])) {
          const schedule: WorkSchedule[] = [];
          DAYS_OF_WEEK.forEach(day => {
            const cleanDay = day.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const startKey = `${cleanDay}_Inicio`;
            const endKey = `${cleanDay}_Fin`;
            const accentStartKey = `${day}_Inicio`;
            const accentEndKey = `${day}_Fin`;
            const valStart = row[startKey] || row[accentStartKey];
            const valEnd = row[endKey] || row[accentEndKey];
            if (valStart && valEnd) {
              schedule.push({ startDay: day, startTime: String(valStart), endDay: day, endTime: String(valEnd) });
            }
          });

          let rowRole = String(row['Rol'] || 'Mozo').trim();
          if (rowRole.toLowerCase() === 'admin') {
            rowRole = 'Mozo';
            convertedAdminCount++;
          }

          const newUser: User = {
            id: '',
            dni: String(row['DNI'] || '').trim(),
            name: String(row['Nombre'] || '').trim(),
            role: rowRole,
            legajo: String(row['Legajo'] || `LEG-${Math.floor(Math.random()*8999+1000)}`).trim(),
            dressCode: String(row['Vestimenta'] || 'Uniforme estándar').trim(),
            schedule,
            photoRef: null,
            assignedLocations: [],
            isActive: true
          };

          if (newUser.name && newUser.dni) {
            users.push(newUser);
          }
        }

        resolve({ users, convertedAdminCount });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
