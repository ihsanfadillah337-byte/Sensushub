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

  // Civic Backdrop Image from user's reference
  const civicBackdrop = "https://lh3.googleusercontent.com/aida/AEtjO1XMf1OUziDlnYvO3ceXIJ0iY1mq9rF5XhyKNJSkDHokPLh1M9nQzg50g1RmO4WVWvuwjYpowpHOi8YmMkZFFi571Xwhf0i354Z-rwp2ujV2TnMN-eJXVUjG4QGrFjQH28RQQVQTEDKSBUyEjn_gmCUTOi7Qbw1jJPN61K8IQi25I6SH7PMgo3RV6XkCe8knsNNefv6F0NrDtMe_1dlNbA49ohuHkAsSyHwufFn5IwQ5";

  return (
    <div className="min-h-screen w-full bg-[#f8f9ff] flex items-center justify-center p-0 lg:p-10 font-sans selection:bg-blue-100">
      <main className="w-full max-w-[1360px] min-h-screen lg:min-h-[760px] bg-white lg:rounded-[32px] border border-slate-200/50 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Column: Hero Civic Showcase (7/12 = ~58%) */}
        <div className="relative lg:col-span-7 min-h-[540px] lg:min-h-[760px] flex flex-col justify-between p-10 md:p-14 lg:p-20 overflow-hidden bg-[#eff4ff]/30">
          
          {/* Architectural Backdrop */}
          <div className="absolute inset-0 z-0">
            <img 
              src={civicBackdrop} 
              alt="Gedung Balai Kota Bandung" 
              className="absolute inset-0 w-full h-full object-cover object-center opacity-30 select-none pointer-events-none mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-white/40"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-white"></div>
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
          <div className="relative z-10 max-w-xl my-auto py-10">
            <h1 className="text-[36px] lg:text-[44px] leading-[1.1] text-[#0F172A] font-bold tracking-tight mb-6">
              Transformasi Digital Tata Kelola Aset Daerah
            </h1>
            <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-md">
              Platform rekonsiliasi, inventarisasi otomatis, dan audit real-time Barang Milik Daerah.
            </p>
            
            <div className="flex flex-wrap gap-3 mt-10">
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
        <div className="lg:col-span-5 p-10 md:p-14 lg:p-20 flex flex-col justify-center bg-white lg:border-l border-slate-200/50 text-[#1E293B]">
          <div className="max-w-[400px] w-full mx-auto space-y-10">
            {/* Header */}
            <div className="space-y-2 text-left">
              <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">Portal SIPPA-BMD</h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed">
                Akses terpadu pengelola aset & tim rekon BKAD Kab. Bandung.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
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
                      className="w-full pl-12 pr-4 py-6 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
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
                    className="w-full pl-12 pr-4 py-6 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
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
                    className="w-full pl-12 pr-12 py-6 rounded-xl bg-[#f8f9ff] border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-700 shadow-sm"
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

              <div className="flex flex-col gap-3 pt-2">
                <Button 
                  type="submit" 
                  className="w-full py-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20 transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.99]" 
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
                  className="w-full py-6 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E293B] font-bold transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99] shadow-sm"
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
            <div className="pt-10 text-center">
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
