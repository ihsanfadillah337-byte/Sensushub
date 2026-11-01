import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, QrCode, Lock, Mail, Eye, EyeOff, UserPlus, LogIn, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      navigate("/dashboard/assets", { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email dan password wajib diisi.");
      return;
    }
    if (!isLogin && !companyName.trim()) {
      toast.error("Nama Instansi wajib diisi.");
      return;
    }

    setLoading(true);

    const { allowed, remainingMs } = await checkRateLimit(`login_${email.trim()}`);
    if (!allowed) {
      const minutes = Math.ceil(remainingMs / 60000);
      toast.error(`Terlalu banyak percobaan. Silakan coba lagi dalam ${minutes} menit.`);
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        resetRateLimit(`login_${email.trim()}`);
        toast.success("Login berhasil!");
        navigate("/dashboard/assets", { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { company_name: companyName.trim() },
          },
        });
        if (error) throw error;
        toast.success("Registrasi berhasil! Silakan cek email Anda untuk verifikasi.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white flex overflow-hidden font-sans selection:bg-blue-100">
      <div className="w-full flex flex-col md:flex-row h-screen">
        
        {/* Left Section: Branding & Minimal Aurora */}
        <div className="relative w-full md:w-[58%] h-[35%] md:h-full overflow-hidden flex flex-col bg-[#F8FAFC]">
          {/* Subtle architectural background effect */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-100/30 rounded-full blur-[120px] pointer-events-none animate-pulse" />
          
          {/* Content Wrapper */}
          <div className="relative h-full p-12 md:p-24 flex flex-col z-10 text-left">
            {/* Top Branding */}
            <div className="flex flex-col mb-32">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1E293B] tracking-tight">SIPPA-BMD</h2>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">V1 PRO</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Pemerintah Kabupaten Bandung</span>
            </div>

            {/* Middle Content: Clean Typography */}
            <div className="my-auto max-w-xl space-y-6">
              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-[#0F172A] leading-[1.1] tracking-tight">
                Transformasi Digital <br />
                Tata Kelola Aset Daerah
              </h1>
              <p className="text-base md:text-lg text-slate-500 font-medium leading-relaxed max-w-md">
                Platform rekonsiliasi, inventarisasi otomatis, dan audit real-time Barang Milik Daerah.
              </p>
            </div>

            {/* Bottom Left: Simple Badges */}
            <div className="flex flex-wrap gap-3 mt-auto">
              <div className="flex items-center gap-2.5 bg-white border border-slate-100 px-4 py-2.5 rounded-xl shadow-sm">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-600">Akuntabel & Terintegrasi</span>
              </div>
              <div className="flex items-center gap-2.5 bg-white border border-slate-100 px-4 py-2.5 rounded-xl shadow-sm">
                <QrCode className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-600">QR Code Otomatis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Clean Login Portal */}
        <div className="w-full md:w-[42%] flex flex-col justify-center items-center bg-white h-[65%] md:h-full relative px-10 lg:px-24">
          <div className="w-full max-w-[400px] space-y-10">
            {/* Header */}
            <div className="space-y-2 text-left">
              <h2 className="text-3xl font-bold text-[#0F172A] tracking-tight">Portal SIPPA-BMD</h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed">
                Akses terpadu pengelola aset & tim rekon BKAD Kab. Bandung.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {!isLogin && (
                <div className="space-y-2 text-left">
                  <Label htmlFor="company-name" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Nama Instansi / Perusahaan</Label>
                  <div className="relative">
                    <Input
                      id="company-name"
                      placeholder="Masukkan nama instansi"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={loading}
                      className="pl-11 h-12 bg-white border-slate-200 rounded-xl focus:ring-blue-600 focus:border-blue-600 transition-all font-medium text-slate-700 shadow-none"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 text-left">
                <Label htmlFor="email" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Alamat Surel Kedinasan / NIP</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@bandungkab.go.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="pl-11 h-12 bg-white border-slate-200 rounded-xl focus:ring-blue-600 focus:border-blue-600 transition-all font-medium text-slate-700 shadow-none"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <div className="flex justify-between items-center ml-1">
                  <Label htmlFor="password" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kata Sandi Portal</Label>
                  <button type="button" className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors tracking-tight">Lupa Password?</button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pl-11 pr-11 h-12 bg-white border-slate-200 rounded-xl focus:ring-blue-600 focus:border-blue-600 transition-all font-medium text-slate-700 shadow-none"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 ml-1">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="remember" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                  />
                  <label htmlFor="remember" className="text-[11px] font-bold text-slate-500 cursor-pointer select-none">Ingat kredensial di perangkat ini</label>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">SSL 256-Bit</span>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <Button type="submit" className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-100 transition-all flex items-center justify-center gap-2" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>{isLogin ? "Masuk ke Sistem" : "Buat Akun"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsLogin(!isLogin)}
                  className="w-full h-12 rounded-xl text-slate-600 font-bold text-sm border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  {isLogin ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      <span>Daftarkan Akun</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      <span>Sudah punya akun? Masuk</span>
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Footer Text */}
            <div className="pt-10 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                &copy; 2026 & 2027 BKAD KABUPATEN BANDUNG • SIPPA-BMD
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
