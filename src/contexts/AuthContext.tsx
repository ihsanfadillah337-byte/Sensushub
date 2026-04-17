import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { AppRole } from "@/types/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companyId: string | null;
  companyName: string | null;
  role: AppRole | null;
  fullName: string | null;
  signOut: () => Promise<void>;
  /** Check if user has one of the given roles */
  hasRole: (...roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  /**
   * Fetch profile from user_profiles, then JOIN companies to get company name.
   * This replaces the old single-owner fetchCompany pattern.
   */
  const fetchProfile = async (userId: string) => {
    try {
      // Step 1: Fetch user_profiles row (RLS: user can read own profile)
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("company_id, role, full_name")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        // Fallback: try legacy companies.user_id lookup for backward compat
        await fetchCompanyLegacy(userId);
        return;
      }

      if (!profile) {
        // Profile doesn't exist yet (edge case: trigger might not have fired)
        console.warn("No user_profiles row found, falling back to legacy lookup");
        await fetchCompanyLegacy(userId);
        return;
      }

      setRole((profile.role as AppRole) || "operator");
      setFullName(profile.full_name || null);
      setCompanyId(profile.company_id || null);

      // Step 2: Fetch company name if company_id exists
      if (profile.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", profile.company_id)
          .maybeSingle();
        setCompanyName(company?.name ?? null);
      } else {
        setCompanyName(null);
      }
    } catch (err) {
      console.error("Error in fetchProfile:", err);
      resetProfileState();
    }
  };

  /**
   * Legacy fallback: for users who haven't been migrated to user_profiles yet.
   * Reads from the old companies.user_id pattern.
   */
  const fetchCompanyLegacy = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("user_id", userId)
        .maybeSingle();
      setCompanyId(data?.id ?? null);
      setCompanyName(data?.name ?? null);
      // Assume super_admin for legacy owner accounts
      setRole("super_admin");
      setFullName(null);
    } catch (err) {
      console.error("Error in legacy company fetch:", err);
      resetProfileState();
    }
  };

  const resetProfileState = () => {
    setCompanyId(null);
    setCompanyName(null);
    setRole(null);
    setFullName(null);
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid blocking the auth state change callback
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          resetProfileState();
        }
        setLoading(false);
      }
    );

    // Then check existing session with try/catch/finally
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (error) {
        console.error("Error getting session:", error);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const hasRole = (...roles: AppRole[]) => {
    if (!role) return false;
    return roles.includes(role);
  };

  return (
    <AuthContext.Provider value={{ 
      user, session, loading, 
      companyId, companyName, 
      role, fullName, 
      signOut, hasRole 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
