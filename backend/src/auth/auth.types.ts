// FILE: src/auth/auth.types.ts

export interface JwtPayload {
  id: number;
  email: string;
  rol: 'ADMIN' | 'SECRETARIO' | 'CHOFER';
  nombre: string;
}

export interface LoginDto {
  email: string;
  password: string;
  ip?: string;
}

export interface AccesoLinkFijoDto {
  tokenPlano: string;
  ip?: string;
}

export interface AuthResponse {
  token: string;
  csrfToken: string;
  usuario: {
    id: number;
    nombre: string;
    email: string;
    rol: string;
  };
}
