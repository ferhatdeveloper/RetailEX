import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Shield, Users, Lock, Plus, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Role {
    logicalref: number;
    name: string;
    description: string;
}

interface Permission {
    logicalref: number;
    code: string;
    description: string;
}

export function AuthorizationSettings() {
    const { t } = useLanguage();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);

    // New Role State
    const [newRoleName, setNewRoleName] = useState('');

    const supabaseUrl = `https://${projectId}.supabase.co/rest/v1`;

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [rolesRes, permsRes] = await Promise.all([
                fetch(`${supabaseUrl}/FN_ROLES?select=*&order=name`, {
                    headers: { 'apikey': publicAnonKey, 'Authorization': `Bearer ${publicAnonKey}` }
                }),
                fetch(`${supabaseUrl}/FN_PERMISSIONS?select=*&order=code`, {
                    headers: { 'apikey': publicAnonKey, 'Authorization': `Bearer ${publicAnonKey}` }
                })
            ]);

            if (rolesRes.ok && permsRes.ok) {
                setRoles(await rolesRes.json());
                setPermissions(await permsRes.json());
            }
        } catch (error) {
            toast.error('Yetkilendirme verileri yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const createRole = async () => {
        if (!newRoleName) return;
        try {
            const res = await fetch(`${supabaseUrl}/FN_ROLES`, {
                method: 'POST',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ name: newRoleName, description: 'User created role' })
            });

            if (res.ok) {
                toast.success('Rol oluşturuldu');
                setNewRoleName('');
                fetchData();
            } else {
                throw new Error('Hata');
            }
        } catch (e) {
            toast.error('Rol oluşturulamadı');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        Yetkilendirme ve Roller
                    </h3>
                    <p className="text-sm text-gray-500">Kullanıcı rolleri ve erişim izinlerini yönetin</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Roles Panel */}
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium flex items-center gap-2">
                            <Users className="w-4 h-4" /> Roller
                        </h4>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <Input
                            value={newRoleName}
                            onChange={e => setNewRoleName(e.target.value)}
                            placeholder="Yeni rol adı..."
                            className="h-9"
                        />
                        <Button size="sm" onClick={createRole} disabled={!newRoleName}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {roles.map(role => (
                            <div key={role.logicalref} className="flex items-center justify-between p-2 bg-gray-50 rounded border hover:bg-gray-100 cursor-pointer">
                                <span className="font-medium">{role.name}</span>
                                <span className="text-xs text-gray-400">ID: {role.logicalref}</span>
                            </div>
                        ))}
                        {roles.length === 0 && <div className="text-sm text-gray-400 text-center py-4">Rol bulunamadı</div>}
                    </div>
                </div>

                {/* Permissions Panel */}
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium flex items-center gap-2">
                            <Lock className="w-4 h-4" /> İzin Tanımları
                        </h4>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-auto">
                        {permissions.map(perm => (
                            <div key={perm.logicalref} className="flex items-center gap-3 p-2 border-b last:border-0">
                                <div className="bg-blue-100 text-blue-700 p-1 rounded">
                                    <Check className="w-3 h-3" />
                                </div>
                                <div>
                                    <div className="text-sm font-mono font-medium">{perm.code}</div>
                                    <div className="text-xs text-gray-500">{perm.description || 'Açıklama yok'}</div>
                                </div>
                            </div>
                        ))}
                        {permissions.length === 0 && <div className="text-sm text-gray-400 text-center py-4">İzin tanımı yok</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

