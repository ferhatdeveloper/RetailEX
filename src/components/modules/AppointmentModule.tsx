import { useState } from 'react';
import { Calendar, Clock, Users, Search, Plus, X, Check, Phone, Mail, AlertCircle, Bell, ChevronLeft, ChevronRight, Filter, Download, Printer, Edit, Trash2, Video, MapPin } from 'lucide-react';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'noshow';
type AppointmentType = 'in-person' | 'online' | 'phone';

interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  service: string;
  staff: string;
  date: string;
  time: string;
  duration: number;
  status: AppointmentStatus;
  type: AppointmentType;
  notes?: string;
  reminderSent: boolean;
}

interface TimeSlot {
  time: string;
  available: boolean;
  appointment?: Appointment;
}

export function AppointmentModule() {
  const [activeView, setActiveView] = useState<'calendar' | 'list' | 'schedule'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'all'>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');

  // Mock data
  const services = [
    'Saç Kesimi',
    'Saç Boyama',
    'Manikür',
    'Pedikür',
    'Cilt Bakımı',
    'Masaj',
    'Epilasyon',
    'Kalıcı Makyaj',
    'Protez Tırnak',
    'Kaş Tasarımı'
  ];

  const staff = [
    { id: 's1', name: 'Aisha Al-Sadr', specialty: 'Kuaför', avatar: 'ğŸ‘©â€ğŸ¦°' },
    { id: 's2', name: 'Layla Hassan', specialty: 'Güzellik Uzmanı', avatar: 'ğŸ‘©' },
    { id: 's3', name: 'Fatima Al-Zaidi', specialty: 'Masöz', avatar: 'ğŸ‘©â€âš•ï¸' },
    { id: 's4', name: 'Noor Mohammed', specialty: 'Estetisyen', avatar: 'ğŸ‘±â€â™€ï¸' },
  ];

  const appointments = [
    {
      id: 'a1',
      customerName: 'Layla Ibrahim',
      customerPhone: '+964 750 111 2233',
      customerEmail: 'layla@example.com',
      service: 'Saç Kesimi',
      staff: 'Aisha Al-Sadr',
      date: '2024-12-10',
      time: '09:00',
      duration: 60,
      status: 'confirmed',
      type: 'in-person',
      reminderSent: true,
      notes: 'Orta boy kesim tercih ediyor'
    },
    {
      id: 'a2',
      customerName: 'Sara Ahmed',
      customerPhone: '+964 770 222 3344',
      customerEmail: 'sara@example.com',
      service: 'Manikür',
      staff: 'Layla Hassan',
      date: '2024-12-10',
      time: '10:00',
      duration: 45,
      status: 'scheduled',
      type: 'in-person',
      reminderSent: false
    },
    {
      id: 'a3',
      customerName: 'Omar Khalil',
      customerPhone: '+964 771 333 4455',
      customerEmail: 'omar@example.com',
      service: 'Masaj',
      staff: 'Fatima Al-Zaidi',
      date: '2024-12-10',
      time: '11:00',
      duration: 90,
      status: 'confirmed',
      type: 'in-person',
      reminderSent: true
    },
    {
      id: 'a4',
      customerName: 'Noor Mohammed',
      customerPhone: '+964 772 444 5566',
      customerEmail: 'noor@example.com',
      service: 'Cilt Bakımı',
      staff: 'Noor Mohammed',
      date: '2024-12-10',
      time: '14:00',
      duration: 60,
      status: 'completed',
      type: 'in-person',
      reminderSent: true
    },
    {
      id: 'a5',
      customerName: 'Zainab Ali',
      customerPhone: '+964 750 555 6677',
      customerEmail: 'zainab@example.com',
      service: 'Saç Boyama',
      staff: 'Aisha Al-Sadr',
      date: '2024-12-10',
      time: '15:30',
      duration: 120,
      status: 'scheduled',
      type: 'in-person',
      reminderSent: false
    },
    {
      id: 'a6',
      customerName: 'Hassan Karim',
      customerPhone: '+964 771 666 7788',
      customerEmail: 'hassan@example.com',
      service: 'Saç Kesimi',
      staff: 'Aisha Al-Sadr',
      date: '2024-12-11',
      time: '10:00',
      duration: 45,
      status: 'scheduled',
      type: 'online',
      reminderSent: false,
      notes: 'Online danışmanlık'
    },
  ];

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'confirmed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'completed':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'noshow':
        return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  const getStatusLabel = (status: AppointmentStatus) => {
    switch (status) {
      case 'scheduled':
        return 'Planlandı';
      case 'confirmed':
        return 'Onaylandı';
      case 'completed':
        return 'Tamamlandı';
      case 'cancelled':
        return 'İptal';
      case 'noshow':
        return 'Gelmedi';
    }
  };

  const getTypeIcon = (type: AppointmentType) => {
    switch (type) {
      case 'in-person':
        return MapPin;
      case 'online':
        return Video;
      case 'phone':
        return Phone;
    }
  };

  const generateTimeSlots = () => {
    const slots: TimeSlot[] = [];
    const startHour = 9;
    const endHour = 19;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const dateStr = selectedDate.toISOString().split('T')[0];
        const appointment = appointments.find(a => a.date === dateStr && a.time === time && (filterStaff === 'all' || a.staff === filterStaff));
        
        slots.push({
          time,
          available: !appointment,
          appointment
        });
      }
    }

    return slots;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        isCurrentMonth: true,
        date: new Date(year, month, day)
      });
    }

    // Next month days
    const remainingDays = 42 - days.length; // 6 weeks * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        isCurrentMonth: false,
        date: new Date(year, month + 1, day)
      });
    }

    return days;
  };

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(a => a.date === dateStr);
  };

  const previousMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  const filteredAppointments = appointments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterStaff !== 'all' && a.staff !== filterStaff) return false;
    return true;
  });

  const todayAppointments = appointments.filter(a => a.date === new Date().toISOString().split('T')[0]);
  const upcomingAppointments = appointments.filter(a => {
    const appointmentDate = new Date(a.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return appointmentDate > today && (a.status === 'scheduled' || a.status === 'confirmed');
  });

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Randevu Sistemi</h1>
              <p className="text-sm text-purple-100">Takvim yönetimi, müşteri randevuları ve hatırlatmalar</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
              <div className="text-xs text-purple-200">Bugün</div>
              <div className="text-2xl font-bold">{todayAppointments.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
              <div className="text-xs text-purple-200">Yaklaşan</div>
              <div className="text-2xl font-bold">{upcomingAppointments.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
              <div className="text-xs text-purple-200">Toplam</div>
              <div className="text-2xl font-bold">{appointments.length}</div>
            </div>
            <button
              onClick={() => {
                setSelectedAppointment(null);
                setShowAppointmentModal(true);
              }}
              className="px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-purple-50 font-semibold flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Yeni Randevu
            </button>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 items-center justify-between">
          <div className="flex gap-1">
            {[
              { id: 'calendar', label: 'Takvim Görünümü', icon: Calendar },
              { id: 'schedule', label: 'Saat Bazlı', icon: Clock },
              { id: 'list', label: 'Liste Görünümü', icon: Users },
            ].map(view => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id as any)}
                className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 transition-colors ${
                  activeView === view.id
                    ? 'border-purple-600 text-purple-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <view.icon className="w-4 h-4" />
                {view.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-2 py-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="scheduled">Planlandı</option>
              <option value="confirmed">Onaylandı</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal</option>
              <option value="noshow">Gelmedi</option>
            </select>

            <select
              value={filterStaff}
              onChange={(e) => setFilterStaff(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Tüm Personel</option>
              {staff.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Calendar View */}
        {activeView === 'calendar' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={previousMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  Bugün
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                <div key={day} className="text-center font-semibold text-sm text-gray-600 py-2">
                  {day}
                </div>
              ))}

              {/* Days */}
              {getDaysInMonth(selectedDate).map((dayInfo, idx) => {
                const dayAppointments = getAppointmentsForDate(dayInfo.date);
                const isToday = dayInfo.date.toDateString() === new Date().toDateString();
                const isSelected = dayInfo.date.toDateString() === selectedDate.toDateString();

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(dayInfo.date)}
                    className={`min-h-24 p-2 rounded-lg border-2 transition-all ${
                      !dayInfo.isCurrentMonth
                        ? 'bg-gray-50 text-gray-400 border-transparent'
                        : isSelected
                        ? 'bg-purple-50 border-purple-500'
                        : isToday
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`text-sm font-semibold mb-1 ${
                      isToday ? 'text-blue-600' : dayInfo.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {dayInfo.day}
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.slice(0, 3).map(apt => (
                        <div
                          key={apt.id}
                          className={`text-xs px-1 py-0.5 rounded truncate ${getStatusColor(apt.status)}`}
                        >
                          {apt.time} {apt.customerName.split(' ')[0]}
                        </div>
                      ))}
                      {dayAppointments.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{dayAppointments.length - 3} daha
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Schedule View */}
        {activeView === 'schedule' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setDate(newDate.getDate() - 1);
                      setSelectedDate(newDate);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedDate(new Date())}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    Bugün
                  </button>
                  <button
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setDate(newDate.getDate() + 1);
                      setSelectedDate(newDate);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-2">
                {generateTimeSlots().map((slot, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-4 p-3 rounded-lg border-2 ${
                      slot.available
                        ? 'bg-white border-gray-200 hover:border-purple-300 cursor-pointer'
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    onClick={() => {
                      if (slot.available) {
                        setShowAppointmentModal(true);
                      } else if (slot.appointment) {
                        setSelectedAppointment(slot.appointment);
                        setShowAppointmentModal(true);
                      }
                    }}
                  >
                    <div className="w-20 font-semibold text-gray-700">{slot.time}</div>
                    {slot.appointment ? (
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`px-3 py-1 rounded-full text-sm border ${getStatusColor(slot.appointment.status)}`}>
                            {getStatusLabel(slot.appointment.status)}
                          </div>
                          <div>
                            <div className="font-semibold">{slot.appointment.customerName}</div>
                            <div className="text-sm text-gray-600">{slot.appointment.service} - {slot.appointment.staff}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{slot.appointment.duration} dk</span>
                          {!slot.appointment.reminderSent && (
                            <Bell className="w-4 h-4 text-orange-500" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-gray-400 text-sm">Müsait</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* List View */}
        {activeView === 'list' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Tüm Randevular</h2>
              <div className="flex gap-2">
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  Dışa Aktar
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm">
                  <Printer className="w-4 h-4" />
                  Yazdır
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tarih & Saat</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Müşteri</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">İletişim</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Hizmet</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Personel</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Durum</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tip</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAppointments.map(apt => {
                    const TypeIcon = getTypeIcon(apt.type);
                    return (
                      <tr key={apt.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">
                            {new Date(apt.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                          </div>
                          <div className="text-sm text-gray-600">{apt.time}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{apt.customerName}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone className="w-3 h-3" />
                              {apt.customerPhone}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Mail className="w-3 h-3" />
                              {apt.customerEmail}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{apt.service}</div>
                          <div className="text-xs text-gray-500">{apt.duration} dakika</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{apt.staff}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${getStatusColor(apt.status)}`}>
                            {getStatusLabel(apt.status)}
                          </span>
                          {!apt.reminderSent && apt.status === 'scheduled' && (
                            <div className="flex items-center gap-1 text-xs text-orange-600 mt-1">
                              <Bell className="w-3 h-3" />
                              Hatırlatıcı gönderilmedi
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <TypeIcon className="w-4 h-4 text-gray-600" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setSelectedAppointment(apt);
                                setShowAppointmentModal(true);
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              <Edit className="w-4 h-4 text-blue-600" />
                            </button>
                            <button className="p-1 hover:bg-gray-200 rounded">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                            {apt.status === 'scheduled' && (
                              <button className="p-1 hover:bg-gray-200 rounded">
                                <Check className="w-4 h-4 text-green-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-purple-600 text-white p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {selectedAppointment ? 'Randevu Düzenle' : 'Yeni Randevu Oluştur'}
              </h2>
              <button
                onClick={() => {
                  setShowAppointmentModal(false);
                  setSelectedAppointment(null);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Müşteri Adı *
                    </label>
                    <input
                      type="text"
                      defaultValue={selectedAppointment?.customerName}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Ad Soyad"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Telefon *
                    </label>
                    <input
                      type="tel"
                      defaultValue={selectedAppointment?.customerPhone}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="+964 750 XXX XXXX"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    E-posta
                  </label>
                  <input
                    type="email"
                    defaultValue={selectedAppointment?.customerEmail}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="ornek@email.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hizmet *
                    </label>
                    <select
                      defaultValue={selectedAppointment?.service}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Hizmet Seçin</option>
                      {services.map(service => (
                        <option key={service} value={service}>{service}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Personel *
                    </label>
                    <select
                      defaultValue={selectedAppointment?.staff}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Personel Seçin</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.name}>{s.avatar} {s.name} - {s.specialty}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tarih *
                    </label>
                    <input
                      type="date"
                      defaultValue={selectedAppointment?.date}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Saat *
                    </label>
                    <input
                      type="time"
                      defaultValue={selectedAppointment?.time}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Süre (dk) *
                    </label>
                    <input
                      type="number"
                      defaultValue={selectedAppointment?.duration || 60}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Randevu Tipi
                    </label>
                    <select
                      defaultValue={selectedAppointment?.type || 'in-person'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="in-person">Yerinde</option>
                      <option value="online">Online</option>
                      <option value="phone">Telefon</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Durum
                    </label>
                    <select
                      defaultValue={selectedAppointment?.status || 'scheduled'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="scheduled">Planlandı</option>
                      <option value="confirmed">Onaylandı</option>
                      <option value="completed">Tamamlandı</option>
                      <option value="cancelled">İptal</option>
                      <option value="noshow">Gelmedi</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notlar
                  </label>
                  <textarea
                    defaultValue={selectedAppointment?.notes}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Ek notlar..."
                  />
                </div>

                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Bell className="w-5 h-5 text-blue-600" />
                  <label className="flex items-center gap-2 text-sm text-blue-900">
                    <input type="checkbox" className="rounded" defaultChecked />
                    Müşteriye SMS hatırlatıcısı gönder
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAppointmentModal(false);
                  setSelectedAppointment(null);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                {selectedAppointment ? 'Güncelle' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
