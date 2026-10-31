/**
 * Hizmet & tarih panosu. Her randevu kendi hizmetinde bir kez durur.
 * Aynı ad iki sütunda olsa da kimlik tutan randevu kopyalanmaz.
 */

export interface ServiceDateBoardService {
  id: string;
  name?: string | null;
}

export interface ServiceDateBoardAppointment {
  id: string;
  service_id?: string | null;
  service_name?: string | null;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/** Randevunun gerçek hizmeti. Kimlik katalogda varsa ad eşleşmesi devreye girmez. */
export function serviceDateBoardHomeId(
  apt: Pick<ServiceDateBoardAppointment, 'service_id' | 'service_name'>,
  services: readonly ServiceDateBoardService[],
): string {
  const known = new Set<string>();
  for (const svc of services) {
    const id = clean(svc.id);
    if (id) known.add(id);
  }
  const sid = clean(apt.service_id);
  if (sid && known.has(sid)) return sid;
  const name = clean(apt.service_name);
  if (!name) return '';
  const named = services.filter((svc) => clean(svc.id) && clean(svc.name) === name);
  if (named.length === 0) return '';
  named.sort((a, b) => clean(a.id).localeCompare(clean(b.id)));
  return clean(named[0].id);
}

/** Aynı randevu kimliği en fazla bir hizmet listesine yazılır. */
export function groupServiceDateBoardAppointments<T extends ServiceDateBoardAppointment>(
  appointments: readonly T[],
  services: readonly ServiceDateBoardService[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  const seen = new Set<string>();
  for (const apt of appointments) {
    const id = clean(apt.id);
    if (!id || seen.has(id)) continue;
    const home = serviceDateBoardHomeId(apt, services);
    if (!home) continue;
    seen.add(id);
    const list = out.get(home);
    if (list) list.push(apt);
    else out.set(home, [apt]);
  }
  return out;
}
