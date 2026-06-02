// FILE: src/auth/auth.types.ts

export interface JwtPayload {
  id: number;
  email: string;
  rol: 'ADMIN' | 'SECRETARIO';
  nombre: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    email: string;
    rol: string;
  };
}
