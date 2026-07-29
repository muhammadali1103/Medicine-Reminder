const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const STORAGE_KEY = "mysql_auth_session";

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string | null;
  };
}

export interface AuthSession {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
}

type FilterOperator = "eq" | "neq" | "gte" | "lte" | "gt" | "lt";

function readSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = readSession();
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    return {
      data: null,
      error: {
        message: "Cannot connect to the local API. Please make sure the backend server and MySQL are running.",
        code: "API_UNAVAILABLE",
        cause: error,
      },
    } as T;
  }

  return response.json();
}

const listeners = new Set<(event: string, session: AuthSession | null) => void>();

function emit(event: string, session: AuthSession | null) {
  listeners.forEach((listener) => listener(event, session));
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T; error: any; count?: number | null }> {
  table: string;
  action: "select" | "insert" | "update" | "delete" = "select";
  filters: Array<{ column: string; operator: FilterOperator; value: any }> = [];
  orderBy?: { column: string; ascending?: boolean };
  rowLimit?: number;
  selectedColumns = "*";
  payload: any = null;
  expectSingle = false;
  head = false;
  count?: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    if (this.action === "insert" || this.action === "update") {
      this.selectedColumns = columns;
      if (options?.count) {
        this.count = options.count;
      }
      if (options?.head) {
        this.head = options.head;
      }
      return this;
    }

    this.action = "select";
    this.selectedColumns = columns;
    if (options?.count) {
      this.count = options.count;
    }
    if (options?.head) {
      this.head = options.head;
    }
    return this;
  }

  insert(values: any) {
    this.action = "insert";
    this.payload = values;
    return this;
  }

  update(values: any) {
    this.action = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, operator: "neq", value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ column, operator: "gte", value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ column, operator: "lte", value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ column, operator: "gt", value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ column, operator: "lt", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.expectSingle = true;
    return this;
  }

  async execute() {
    if (this.action === "select") {
      return apiFetch<{ data: T; error: any; count?: number | null }>(`/db/${this.table}/query`, {
        method: "POST",
        body: JSON.stringify({
          filters: this.filters,
          order: this.orderBy,
          limit: this.rowLimit,
          select: this.selectedColumns,
          single: this.expectSingle,
          head: this.head,
          count: this.count,
        }),
      });
    }

    if (this.action === "insert") {
      return apiFetch<{ data: T; error: any }>(`/db/${this.table}/insert`, {
        method: "POST",
        body: JSON.stringify({
          values: this.payload,
          select: this.selectedColumns,
          single: this.expectSingle,
        }),
      });
    }

    if (this.action === "update") {
      return apiFetch<{ data: T; error: any }>(`/db/${this.table}/update`, {
        method: "POST",
        body: JSON.stringify({
          values: this.payload,
          filters: this.filters,
          select: this.selectedColumns,
        }),
      });
    }

    return apiFetch<{ data: T; error: any }>(`/db/${this.table}/delete`, {
      method: "POST",
      body: JSON.stringify({
        filters: this.filters,
      }),
    });
  }

  then<TResult1 = { data: T; error: any; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const apiClient = {
  request<T = any>(path: string, options: RequestInit = {}) {
    return apiFetch<T>(path, options);
  },
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  },
  auth: {
    onAuthStateChange(callback: (event: string, session: AuthSession | null) => void) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },
    async getSession() {
      return { data: { session: readSession() } };
    },
    async getUser() {
      const session = readSession();
      return { data: { user: session?.user || null } };
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: {
        data?: {
          full_name?: string | null;
          role?: string | null;
          doctor_profile?: {
            specialization?: string | null;
            license_number?: string | null;
            hospital?: string | null;
            phone?: string | null;
          } | null;
        };
      };
    }) {
      const response = await apiFetch<{ data?: AuthSession; error?: any }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          fullName: options?.data?.full_name || null,
          role: options?.data?.role || localStorage.getItem("selected_role") || "patient",
          doctorProfile: options?.data?.doctor_profile || null,
        }),
      });

      if (response.data) {
        writeSession(response.data);
        emit("SIGNED_IN", response.data);
      }

      return { data: response.data, error: response.error || null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const response = await apiFetch<{ data?: AuthSession; error?: any }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (response.data) {
        writeSession(response.data);
        emit("SIGNED_IN", response.data);
      }

      return { data: response.data, error: response.error || null };
    },
    async signOut() {
      writeSession(null);
      sessionStorage.removeItem("biometric_unlocked_session");
      emit("SIGNED_OUT", null);
      try {
        await apiFetch("/auth/logout", { method: "POST" });
      } catch (error) {
        console.warn("Server logout request failed after local sign out:", error);
      }
      return { error: null };
    },
    async resetPasswordForEmail() {
      return { data: { success: true }, error: null };
    },
  },
  functions: {
    async invoke(name: string, { body }: { body?: any } = {}) {
      return apiFetch<{ data: any; error: any }>(`/functions/${name}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
    },
  },
  public: {
    async getEmergencyCard(cardId: string) {
      const response = await fetch(`${API_URL}/public/emergency-card/${encodeURIComponent(cardId)}`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.json() as Promise<{ data: any; error: any }>;
    },
  },
};

export type User = AuthUser;
export type Session = AuthSession;
