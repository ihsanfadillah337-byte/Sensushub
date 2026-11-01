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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Improved prompt for a professional government/office building
  const bkadImage = "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20indonesian%20government%20building%20architecture%20with%20red%20accents%20and%20glass%20windows%20clean%20white%20concrete%20walls%20professional%20office%20exterior%20bright%20daylight%20high%20quality%20photography&image_size=landscape_16_9";

  return (
    <div className="min-h-screen w-full bg-slate-50 flex overflow-hidden">
      <div className="w-full flex flex-col md:flex-row h-screen">
        
        {/* Left Section: Branding & Image */}
        <div className="relative w-full md:w-[60%] h-[40%] md:h-full overflow-hidden flex flex-col">
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${bkadImage})`,
              backgroundColor: '#1e293b' 
            }}
          />
          {/* Dark Overlay for contrast */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
          
          {/* Content Wrapper */}
          <div className="relative h-full p-8 md:p-12 lg:p-16 flex flex-col z-10">
            {/* Top Branding (Clean text only) */}
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase">SIPPA-BMD</h2>
                <div className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/30">
                  <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest">V1</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.3em] mt-1">Kabupaten Bandung</span>
            </div>

            {/* Middle Content: Perfectly Centered */}
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <div className="max-w-2xl px-4">
                <h1 className="text-5xl md:text-6xl lg:text-8xl font-black text-white leading-[1.05] mb-8 tracking-tighter">
                  Transformasi <br />
                  <span className="text-blue-400">Digital</span> Tata Kelola <br />
                  Aset Daerah
                </h1>
                <p className="text-xl md:text-2xl text-white/70 font-medium leading-relaxed max-w-xl mx-auto">
                  Platform akselerasi rekonsiliasi dan inventarisasi aset daerah berbasis teknologi digital terintegrasi.
                </p>
              </div>
            </div>

            {/* Bottom Left: Badges */}
            <div className="flex flex-wrap gap-4 mt-auto">
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-5 py-3 rounded-2xl">
                <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-blue-300" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-white tracking-tight uppercase">Akuntabel</span>
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Terintegrasi</span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-5 py-3 rounded-2xl">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <QrCode className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-white tracking-tight uppercase">QR Code</span>
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Otomatis</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Login Portal (The "Kotak Portal") */}
        <div className="w-full md:w-[40%] flex flex-col justify-center items-center bg-slate-50 h-[60%] md:h-full relative px-6 lg:px-12">
          {/* The Portal Card */}
          <div className="w-full max-w-[460px] bg-white p-8 md:p-10 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 space-y-8">
            {/* Header inside card */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Portal Akses Resmi</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Portal SIPPA-BMD</h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed">
                Akses terpadu pengelola aset & tim rekon BKAD Kab. Bandung.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="company-name" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nama Instansi / Perusahaan</Label>
                  <div className="relative">
                    <Input
                      id="company-name"
                      placeholder="Masukkan nama instansi"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={loading}
                      className="pl-11 h-14 bg-slate-50 border-slate-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-all font-bold text-slate-700"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Alamat Surel / NIP</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@bandungkab.go.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="pl-11 h-14 bg-slate-50 border-slate-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-all font-bold text-slate-700 border-2"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <Label htmlFor="password" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Kata Sandi</Label>
                  <button type="button" className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest">Lupa Password?</button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pl-11 pr-11 h-14 bg-slate-50 border-slate-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-all font-bold text-slate-700 border-2"
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
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="remember" className="text-xs font-bold text-slate-500 cursor-pointer select-none tracking-tight">Ingat saya</label>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <Button type="submit" className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-2 group" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? "Masuk ke Sistem" : "Buat Akun"}
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsLogin(!isLogin)}
                  className="w-full h-14 rounded-2xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  {isLogin ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Belum punya akun? <span className="text-blue-600 ml-1">Daftar</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Sudah punya akun? <span className="text-blue-600 ml-1">Masuk</span>
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Footer Text */}
            <div className="pt-8 text-center">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">
                &copy; 2026 & 2027 BKAD KABUPATEN BANDUNG • SIPPA-BMD
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
