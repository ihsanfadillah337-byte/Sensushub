import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import {
  Users, UserPlus, Shield, ClipboardCheck, LayoutDashboard, Search, PackageX
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { UserProfile, AppRole } from "@/types/supabase";

export default function UserManagement() {
  const { companyId, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("operator");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch users in the same company
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async () => {
      // NOTE: RLS must allow super_admin to read profiles in the same company
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: !!companyId,
  });

  // Filter users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = u.full_name?.toLowerCase().includes(q);
    // Since we don't store email directly in user_profiles securely (though we could),
    // we can filter just by name for now unless we do a join.
    // If you need email search, auth.users join is required on backend.
    return !q || nameMatch;
  });

  const getRoleBadge = (role: AppRole) => {
    if (role === "super_admin") return <Badge className="bg-primary/20 text-primary border-primary/30">Super Admin</Badge>;
    if (role === "auditor") return <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/30">Auditor Lapangan</Badge>;
    return <Badge className="bg-muted text-foreground border-border">Operator</Badge>;
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setRole("operator");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName || !role) {
      toast.error("Harap isi semua kolom wajib.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a secondary client without session persistence to avoid logging out the admin
      const supabaseAnonUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseAnonUrl || !supabaseAnonKey) {
        throw new Error("Environment Variables Supabase (URL/Key) hilang atau belum dikonfigurasi.");
      }

      const supabaseSecondary = createClient(supabaseAnonUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Register new user
      const { data: authData, error: signUpError } = await supabaseSecondary.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;
      
      const newUserId = authData.user?.id;
      if (!newUserId) {
        throw new Error("Gagal mendapatkan ID user baru.");
      }

      // Update the profile instead of insert to avoid duplicate key violations caused by database auth trigger
      const { error: profileError } = await supabase.from("user_profiles").update({
        company_id: companyId,
        role: role,
        full_name: fullName,
      }).eq("id", newUserId);

      if (profileError) throw profileError;

      toast.success("Pegawai baru berhasil didaftarkan!");
      setIsDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["company-users"] });

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal membuat pengguna baru.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Manajemen Pengguna
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola akun pegawai (Operator & Auditor) untuk instansi Anda.
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <UserPlus className="h-4 w-4" />
              Tambah Pegawai
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Daftarkan Pegawai Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="pegawai@instansi.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password Sementara</Label>
                <Input
                  id="password"
                  type="text"
                  placeholder="Password minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullname">Nama Lengkap</Label>
                <Input
                  id="fullname"
                  type="text"
                  placeholder="Nama Lengkap Pegawai"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role Akses</Label>
                <Select value={role} onValueChange={(v: AppRole) => setRole(v)} disabled={isSubmitting}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Pilih jabatan/role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator (Cetak Label, Input Data)</SelectItem>
                    <SelectItem value="auditor">Auditor (Sensus Lapangan)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : "Daftarkan Akun"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/60">
        <CardHeader className="py-4 border-b border-border/40 bg-muted/20">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama pegawai..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-4 px-6">Nama Pegawai</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Waktu Didaftarkan</TableHead>
                  {/* <TableHead className="text-right px-6">Aksi</TableHead> */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-4 px-6"><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                       <div className="flex flex-col items-center justify-center">
                          <PackageX className="h-8 w-8 mb-2 opacity-30" />
                          <p>Tidak ada pengguna yang ditemukan.</p>
                       </div>
                     </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="py-4 px-6">
                        <div className="font-medium text-foreground">
                          {u.full_name || "Tanpa Nama"}
                          {u.id === currentUser?.id && <Badge variant="outline" className="ml-2 text-[10px]">Anda</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(u.role)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit", month: "short", year: "numeric"
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 items-start">
         <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
         <div>
            <h4 className="text-sm font-semibold text-primary">Informasi Keamanan RBAC</h4>
            <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
               Hanya pengguna dengan Role <strong>Super Admin</strong> yang dapat mengakses halaman ini dan menambahkan pegawai baru. Setiap data yang dimasukkan terikat eksklusif ke organisasi Anda berkat implementasi <em>Row Level Security</em> di sisi database.
            </p>
         </div>
      </div>
    </div>
  );
}
