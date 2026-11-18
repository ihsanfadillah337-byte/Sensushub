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
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:h-dvh md:overflow-hidden w-full flex items-center justify-center p-4 md:p-6 bg-slate-100/80 font-sans selection:bg-blue-100">
      <main className="relative z-10 w-full max-w-5xl md:max-h-[calc(100dvh-3rem)] rounded-2xl overflow-hidden shadow-lg border border-slate-200/70 grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Column: Hero Civic Showcase (7/12 = ~58%) */}
        <div className="relative lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 lg:p-9 overflow-hidden bg-slate-50">
          
          {/* Architectural Backdrop */}
          <div className="absolute inset-0 z-0">
            <img
              src="/bg-bkad.jpg"
              alt="Gedung BKAD Kabupaten Bandung"
              className="absolute inset-0 w-full h-full object-cover object-center opacity-[0.42] grayscale-[15%] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/65 via-white/35 to-slate-100/70 pointer-events-none" />
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-100/40 blur-[100px] pointer-events-none"></div>
          </div>

          {/* Top Branding (Text only, no logo icon) */}
          <div className="relative z-10 flex flex-col text-left">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[#1E293B] tracking-tight">SIPPA-BMD</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">V1 PRO</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-0.5">Pemerintah Kabupaten Bandung</span>
          </div>

          {/* Center Content: Typography */}
          <div className="relative z-10 max-w-xl my-auto py-6">
            <h1 className="text-2xl lg:text-[30px] leading-tight text-[#0F172A] font-bold tracking-tight mb-4 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
              Transformasi Digital Tata Kelola Aset Daerah
            </h1>
            <p className="text-sm lg:text-base text-slate-500 font-medium leading-relaxed max-w-md drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
              Platform rekonsiliasi, inventarisasi otomatis, dan audit real-time Barang Milik Daerah.
            </p>
            
            <div className="flex flex-wrap gap-3 mt-6">
              <div className="flex items-center gap-2.5 bg-white border border-slate-200/60 px-4 py-2 rounded-xl shadow-sm">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="text-[12px] font-bold text-slate-600">Akuntabel & Terintegrasi</span>
              </div>
              <div className="flex items-center gap-2.5 bg-white border border-slate-200/60 px-4 py-2 rounded-xl shadow-sm">
                <QrCode className="h-4 w-4 text-blue-600" />
                <span className="text-[12px] font-bold text-slate-600">QR Code Otomatis</span>
              </div>
            </div>
          </div>

          {/* Empty Space for Bottom */}
          <div className="relative z-10 mt-auto"></div>
        </div>

        {/* Right Column: Authentication Form (5/12 = ~42%) */}
        <div className="relative z-10 lg:col-span-5 p-6 sm:p-8 lg:p-9 flex flex-col justify-center bg-slate-50/70 text-[#1E293B]">
          <div className="max-w-[400px] w-full mx-auto space-y-6 bg-white border border-slate-100 shadow-sm rounded-2xl p-6 md:p-8">
            {/* Header */}
            <div className="space-y-2 text-left">
              <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">Portal SIPPA-BMD</h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed">
                Akses terpadu pengelola aset & tim rekon BKAD Kab. Bandung.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {!isLogin && (
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="company-name" className="text-[12px] font-bold text-[#1E293B] flex items-center justify-between">
                    Nama Instansi / Perusahaan
                  </Label>
                  <div className="relative flex items-center group">
                    <Mail className="absolute left-4 h-[20px] w-[20px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                    <Input
                      id="company-name"
                      placeholder="Masukkan nama instansi"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={loading}
                      className="w-full h-10 pl-12 pr-4 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-1.5 text-left">
                <Label htmlFor="email" className="text-[12px] font-bold text-[#1E293B] flex items-center justify-between">
                  Alamat Surel Kedinasan / NIP
                </Label>
                <div className="relative flex items-center group">
                  <Mail className="absolute left-4 h-[20px] w-[20px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@bandungkab.go.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full h-10 pl-12 pr-4 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[12px] font-bold text-[#1E293B]">
                    Kata Sandi Portal
                  </Label>
                  <button type="button" className="text-[11px] font-bold text-blue-600 hover:underline transition-colors">
                    Lupa Password?
                  </button>
                </div>
                <div className="relative flex items-center group">
                  <Lock className="absolute left-4 h-[20px] w-[20px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full h-10 pl-12 pr-12 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-[20px] w-[20px]" /> : <Eye className="h-[20px] w-[20px]" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    id="remember" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="remember" className="text-[12px] font-medium text-slate-500 group-hover:text-[#1E293B] transition-colors cursor-pointer select-none">
                    Ingat kredensial di perangkat ini
                  </label>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Lock className="h-[14px] w-[14px] text-emerald-600" />
                  <span className="text-[11px] font-bold uppercase tracking-tight">SSL 256-Bit</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button 
                  type="submit" 
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20 transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.99]" 
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>{isLogin ? "Masuk ke Sistem" : "Buat Akun"}</span>
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsLogin(!isLogin)}
                  className="w-full h-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E293B] font-bold transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99] shadow-sm"
                >
                  {isLogin ? (
                    <>
                      <UserPlus className="h-5 w-5 text-blue-600" />
                      <span>Daftarkan Akun</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5 text-blue-600" />
                      <span>Sudah punya akun? Masuk</span>
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Footer Text */}
            <div className="mt-4 pt-3 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                &copy; 2026 & 2027 BKAD KABUPATEN BANDUNG • SIPPA-BMD
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
