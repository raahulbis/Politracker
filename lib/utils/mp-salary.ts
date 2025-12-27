/**
 * MP Salary calculation utilities
 * Base salary: $209,800 CAD
 * Additional amounts based on parliamentary positions
 */

const BASE_SALARY = 209800;

const POSITION_SALARIES: { [key: string]: number } = {
  "Member": 0,
  "Member of the": 0,
  "Chair of the": 0,
  "Co-Chair": 0,

  "Caucus Chair": 19800,
  "caucus Chair": 19800,

  "Parliamentary Secretary to the Prime Minister": 19800,
  "Parliamentary Secretary to the Leader of the Government in the House of Commons": 19800,
  "Parliamentary Secretary to the President of the Treasury Board": 19800,
  "Parliamentary Secretary to the President of the King's Privy Council for Canada and Minister responsible for Canada-U.S. Trade, Intergovernmental Affairs and One Canadian Economy (Canada-U.S. Trade)": 19800,
  "Parliamentary Secretary to the President of the King's Privy Council for Canada and Minister responsible for Canada-U.S. Trade, Intergovernmental Affairs and One Canadian Economy (Intergovernmental Affairs and One Canadian Economy)": 19800,

  "Parliamentary Secretary to the Minister of Agriculture and Agri-Food": 19800,
  "Parliamentary Secretary to the Minister of Artificial Intelligence and Digital Innovation": 19800,
  "Parliamentary Secretary to the Minister of Canadian Identity and Culture": 19800,
  "Parliamentary Secretary to the Minister of Crown-Indigenous Relations": 19800,
  "Parliamentary Secretary to the Minister of Emergency Management and Community Resilience": 19800,
  "Parliamentary Secretary to the Minister of Energy and Natural Resources": 19800,
  "Parliamentary Secretary to the Minister of Environment and Climate Change": 19800,
  "Parliamentary Secretary to the Minister of Finance and National Revenue": 19800,
  "Parliamentary Secretary to the Minister of Fisheries": 19800,
  "Parliamentary Secretary to the Minister of Foreign Affairs": 19800,
  "Parliamentary Secretary to the Minister of Government Transformation, Public Works and Procurement": 19800,
  "Parliamentary Secretary to the Minister of Health": 19800,
  "Parliamentary Secretary to the Minister of Housing and Infrastructure": 19800,
  "Parliamentary Secretary to the Minister of Immigration, Refugees and Citizenship": 19800,
  "Parliamentary Secretary to the Minister of Indigenous Services": 19800,
  "Parliamentary Secretary to the Minister of Industry": 19800,
  "Parliamentary Secretary to the Minister of International Trade": 19800,
  "Parliamentary Secretary to the Minister of Jobs and Families": 19800,
  "Parliamentary Secretary to the Minister of Justice and Attorney General of Canada": 19800,
  "Parliamentary Secretary to the Minister of National Defence": 19800,
  "Parliamentary Secretary to the Minister of Northern and Arctic Affairs": 19800,
  "Parliamentary Secretary to the Minister of Public Safety": 19800,
  "Parliamentary Secretary to the Minister of Transport and Internal Trade": 19800,
  "Parliamentary Secretary to the Minister of Veterans Affairs and Associate Minister of National Defence": 19800,
  "Parliamentary Secretary to the Minister of Women and Gender Equality": 19800,
  "Parliamentary Secretary to the Secretaries of State": 19800,
  "Parliamentary Secretary to the Minister of Canadian Identity and Culture and Minister responsible for Official Languages and to the Secretary of State (Nature)": 19800,
  "Parliamentary Secretary to the Minister of Canadian Identity and Culture and Minister responsible for Official Languages and to the Secretary of State (Sport)": 19800,
  "Parliamentary Secretary to the Minister of Finance and National Revenue and to the Secretary of State (Canada Revenue Agency and Financial Institutions)": 19800,
  "Parliamentary Secretary to the Minister of Government Transformation, Public Works and Procurement and to the Secretary of State (Defence Procurement)": 19800,
  "Parliamentary Secretary to the Minister of International Trade and to the Secretary of State (International Development)": 19800,
  "Parliamentary Secretary to the Minister of Women and Gender Equality and Secretary of State (Small Business and Tourism)": 19800,
  "Parliamentary Secretary to the Secretaries of State for Labour, for Seniors, and for Children and Youth, and to the Minister of Jobs and Families (Persons with Disabilities)": 19800,
  "Parliamentary Secretary to the Secretary of State (Combatting Crime)": 19800,
  "Parliamentary Secretary to the Secretary of State (Rural Development)": 19800,

  "Secretary of State (Canada Revenue Agency and Financial Institutions)": 49500,
  "Secretary of State (Children and Youth)": 49500,
  "Secretary of State (Combatting Crime)": 49500,
  "Secretary of State (Defence Procurement)": 49500,
  "Secretary of State (International Development)": 49500,
  "Secretary of State (Labour)": 49500,
  "Secretary of State (Nature)": 49500,
  "Secretary of State (Rural Development)": 49500,
  "Secretary of State (Seniors)": 49500,
  "Secretary of State (Small Business and Tourism)": 49500,
  "Secretary of State (Sport)": 49500,

  "Associate Minister of National Defence": 49500,

  "Minister of Agriculture and Agri-Food": 99900,
  "Minister of Artificial Intelligence and Digital Innovation": 99900,
  "Minister of Canadian Identity and Culture": 99900,
  "Minister of Crown-Indigenous Relations": 99900,
  "Minister of Emergency Management and Community Resilience": 99900,
  "Minister of Energy and Natural Resources": 99900,
  "Minister of Finance and National Revenue": 99900,
  "Minister of Fisheries": 99900,
  "Minister of Foreign Affairs": 99900,
  "Minister of Government Transformation, Public Works and Procurement": 99900,
  "Minister of Health": 99900,
  "Minister of Housing and Infrastructure": 99900,
  "Minister of Immigration, Refugees and Citizenship": 99900,
  "Minister of Indigenous Services": 99900,
  "Minister of Industry": 99900,
  "Minister of Internal Trade": 99900,
  "Minister of International Trade": 99900,
  "Minister of Jobs and Families": 99900,
  "Minister of Justice": 99900,
  "Attorney General of Canada": 99900,
  "Minister of National Defence": 99900,
  "Minister of Northern and Arctic Affairs": 99900,
  "Minister of Public Safety": 99900,
  "Minister of Transport": 99900,
  "Minister of Veterans Affairs": 99900,
  "Minister of Women and Gender Equality": 99900,
  "Minister of the Environment, Climate Change and Nature": 99900,
  "Minister responsible for Canada Economic Development for Quebec Regions": 99900,
  "Minister responsible for Canada-U.S. Trade, Intergovernmental Affairs and One Canadian Economy": 99900,
  "Minister responsible for Official Languages": 99900,
  "Minister responsible for Pacific Economic Development Canada": 99900,
  "Minister responsible for Prairies Economic Development Canada": 99900,
  "Minister responsible for the Atlantic Canada Opportunities Agency": 99900,
  "Minister responsible for the Canadian Northern Economic Development Agency": 99900,
  "Minister responsible for the Federal Economic Development Agency for Northern Ontario": 99900,
  "Minister responsible for the Federal Economic Development Agency for Southern Ontario": 99900,

  "Deputy Speaker and Chair of Committees of the Whole": 99900,
  "Assistant Deputy Speaker and Deputy Chair of Committees of the Whole": 49500,
  "Assistant Deputy Speaker and Assistant Deputy Chair of Committees of the Whole": 49500,

  "Speaker": 99900,
  "Chair of the Board of Internal Economy": 99900,
  "Member of the Board of Internal Economy": 0,

  "Leader of the Government in the House of Commons": 99900,
  "House leader of the official opposition": 99900,
  "House leader of the Bloc Québécois": 99900,
  "Deputy House Leader of the Government": 49500,
  "Deputy House leader of the official opposition": 49500,
  "deputy House leader of the Bloc Québécois": 49500,

  "Chief government whip": 49500,
  "chief opposition whip": 49500,
  "Deputy whip of the Official Opposition": 19800,
  "Deputy whip of the Bloc Québécois": 19800,
  "deputy government whip": 19800,
  "whip of the Bloc Québécois": 49500,

  "Leader of the Liberal Party": 203100,
  "Leader of the Opposition": 99900,
  "Leader of the Bloc Québécois": 99900,
  "leader of the Conservative Party of Canada": 99900,

  "President of the Treasury Board": 99900,
  "President of the King's Privy Council for Canada": 99900,

  "Prime Minister": 203100,

  "Special Representative for the Reconstruction of Ukraine": 0
};

export interface ParliamentaryPositionRole {
  title?: string;
  from_date_time?: string;
  to_date_time?: string | null;
}

/**
 * Calculate MP salary based on base salary and parliamentary positions
 * @param positions Array of parliamentary positions
 * @returns Total salary in CAD
 */
export function calculateMPSalary(
  positions?: ParliamentaryPositionRole[]
): number {
  let totalSalary = BASE_SALARY;

  if (!positions || positions.length === 0) {
    return totalSalary;
  }

  // Find the highest position bonus (MPs only get paid for their highest position, not all positions)
  let maxBonus = 0;
  
  positions.forEach((position) => {
    if (position.title) {
      // First try exact match
      let bonus = POSITION_SALARIES[position.title] || 0;
      
      // If no exact match, try to find partial matches for parliamentary secretaries
      // Some positions have longer names that include additional responsibilities
      if (bonus === 0 && position.title.includes('Parliamentary Secretary')) {
        // Check if it starts with "Parliamentary Secretary to the"
        if (position.title.startsWith('Parliamentary Secretary to the')) {
          // Try to match the base pattern
          const baseMatch = position.title.match(/^Parliamentary Secretary to the (.+?)(?: and|$)/);
          if (baseMatch) {
            const baseTitle = `Parliamentary Secretary to the ${baseMatch[1]}`;
            bonus = POSITION_SALARIES[baseTitle] || 0;
          }
          // If still no match, check for "Parliamentary Secretary to the Secretaries of State"
          if (bonus === 0 && position.title.includes('Secretaries of State')) {
            bonus = POSITION_SALARIES['Parliamentary Secretary to the Secretaries of State'] || 0;
          }
        }
      }
      
      // Track the highest bonus
      if (bonus > maxBonus) {
        maxBonus = bonus;
      }
    }
  });

  // Only add the highest bonus (not sum all bonuses)
  return totalSalary + maxBonus;
}

