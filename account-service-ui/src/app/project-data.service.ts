import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environment';
import { AuthService } from './auth.service'; // Adjust this import path to point to your actual auth service file
import { UserAccountNode } from './projects/projects';

// Interfaces
export interface ApiTeam { id: string; name: string; }
export interface ApiTeamMember { id: string; teamId: string; name: string; role: string; }
export interface HydroformedTeam { id: string; name: string; members: ApiTeamMember[]; membersCount: number; }

@Injectable({ providedIn: 'root' })
export class ProjectDataService {
    private baseUrl = environment.apiBaseUrl;
    private projectApi = this.baseUrl + '/projects';
    private teamsApi = this.baseUrl + '/teams';
    private membersApi = this.baseUrl + '/team-members';

    // Injected AuthService to dynamically grab active bearer tokens/session context
    constructor(
        private http: HttpClient,
        private auth: AuthService
    ) { }

    // --- PROJECT CRUD ---

    getAllProjects(): Observable<any[]> {
        return this.http.get<any[]>(this.projectApi, {
            headers: this.auth.getAuthHeaders()
        });
    }

    createProject(data: any): Observable<any> {
        return this.http.post(`${this.projectApi}/create`, data, {
            headers: this.auth.getAuthHeaders()
        });
    }

    updateProject(id: string, data: any): Observable<any> {
        return this.http.put(`${this.projectApi}/${id}`, data, {
            headers: this.auth.getAuthHeaders()
        });
    }

    deleteProject(id: string): Observable<any> {
        return this.http.delete(`${this.projectApi}/${id}`, {
            headers: this.auth.getAuthHeaders()
        });
    }

    // --- TEAM TELEMETRY (For Step 2 & Calculations) ---

    getUnifiedTeamMatrix(): Observable<HydroformedTeam[]> {
        // Both parallel matrix calls require the authorization header
        return forkJoin({
            teams: this.http.get<ApiTeam[]>(this.teamsApi, { headers: this.auth.getAuthHeaders() }),
            members: this.http.get<ApiTeamMember[]>(this.membersApi, { headers: this.auth.getAuthHeaders() })
        }).pipe(
            map(({ teams, members }) => {
                return teams.map(team => {
                    const assignedMembers = members.filter(m => m.teamId === team.id);
                    return {
                        id: team.id,
                        name: team.name,
                        members: assignedMembers,
                        membersCount: assignedMembers.length
                    };
                });
            })
        );
    }

    getOrganizationPersonnel(): Observable<UserAccountNode[]> {
        return this.http.get<any[]>(`${this.baseUrl}/user`, {
            headers: this.auth.getAuthHeaders() // Reuses your existing auth routine perfectly
        }).pipe(
            map((rawDataArray: any[]) => {
                // Formats the incoming raw server items safely for your frontend template
                return rawDataArray.map(item => ({
                    id: item.id,
                    name: item.name || item.username || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown User',
                    email: item.email || '',
                    role: item.role || item.title || 'Team Member'
                }));
            })
        );
    }

}