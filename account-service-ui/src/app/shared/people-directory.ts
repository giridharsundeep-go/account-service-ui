/** People metadata is returned in both camelCase and snake_case by the APIs. */
export function peopleRows(response: any): any[] {
  for (const rows of [response, response?.data, response?.content, response?.data?.content,
    response?.users, response?.data?.users, response?.roles, response?.data?.roles]) {
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

export function personDesignation(user: any, roles: any[] = []): string {
  const id = user?.roleId ?? user?.role_id ?? user?.role?.id;
  const role = roles.find(item => Number(item.id ?? item.roleId ?? item.role_id) === Number(id));
  const value = [role?.roleName, role?.role_name, role?.name, role?.title,
    user?.designation, user?.jobTitle, user?.job_title, user?.roleName, user?.role_name,
    user?.role?.roleName, user?.role?.name, typeof user?.role === 'string' ? user.role : '']
    .find(value => typeof value === 'string' && value.trim() && value !== 'Designation not set');
  return value && !/^(team[_ ]member|member)$/i.test(String(value)) ? String(value) : 'Designation not set';
}

export function personRegions(user: any): string[] {
  return [...new Set([user?.region, user?.locationCountry ?? user?.location_country,
    user?.locationState ?? user?.location_state, user?.locationCity ?? user?.location_city]
    .filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

export function personRoleLabels(user: any, roles: any[] = []): string[] {
  const value = personDesignation(user, roles);
  const extras = (Array.isArray(user?.roles) ? user.roles : []).map((role: any) =>
    typeof role === 'string' ? role : personDesignation({role}, roles));
  return [...new Set([value, user?.orgRole ?? user?.org_role, ...extras].filter(Boolean).map(String))];
}
