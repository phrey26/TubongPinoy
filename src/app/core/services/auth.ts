import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Auth {

  private API_URL = 'http://localhost:5000/api/users';

  constructor(private http: HttpClient) {}

  signup(data: { username: string; email: string; password: string }): Observable<any> {
    return this.http.post(`${this.API_URL}/signup`, data);
  }

  login(data: { identity: string; password: string }): Observable<any> {
    return this.http.post(`${this.API_URL}/login`, data);
  }

  saveUser(user: any) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  getUser(): any {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  logout() {
    localStorage.removeItem('user');
  }
}
