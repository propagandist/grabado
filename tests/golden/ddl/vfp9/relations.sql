LPARAMETERS teLongName, tcCommand, tcPath
* [teLongName] False: set llDbc=.F. and generates "FREE", Empty: generates without "FREE" and "NAME", otherwise generates "NAME teLongName"
* [tcCommand] if used, &tcCommand command will run after CREATE TABLE, f.e. "= MyProc( ALIAS(), m.lcTableComment, @lacComments )"
* [tcPath] path where tables will be created (if not used, tables will be created in current folder)

LOCAL ARRAY lacComments[1,2]
LOCAL llDbc, lcFreeOrName, lcTableComment
llDbc = VARTYPE( m.teLongName )=[C]
	* no special support for llDbc=True yet (you could improve db\vfp9\output.xsl and remove "xsl:if test=[1=2]" from it)
lcFreeOrName = IIF( m.llDbc, IIF( EMPTY( m.teLongName ), [], [NAME "] + m.teLongName + ["] ), [FREE] )
tcPath = IIF( VARTYPE( m.tcPath )=[L], [], ADDBS( m.tcPath ) )

ERASE 'employees.dbf'
ERASE 'employees.fpt'
ERASE 'employees.cdx'
ERASE 'employees.bak'
ERASE 'employees.tbk'

CREATE TABLE (m.tcPath + 'employees') &lcFreeOrName ( ;
id INTEGER NOT NULL , ;
name INTEGER NOT NULL , ;
manager_id INTEGER NULL UL  ;
)

lcTableComment = ''
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'name'
	lacComments[2,2] = ''
	lacComments[3,1] = 'manager_id'
	lacComments[3,2] = '直属の上長（自己参照）'

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF

ERASE 'projects.dbf'
ERASE 'projects.fpt'
ERASE 'projects.cdx'
ERASE 'projects.bak'
ERASE 'projects.tbk'

CREATE TABLE (m.tcPath + 'projects') &lcFreeOrName ( ;
id INTEGER NOT NULL , ;
title INTEGER NOT NULL , ;
owner_id INTEGER NOT NULL , ;
team_id INTEGER NULL UL  ;
)

lcTableComment = ''
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'title'
	lacComments[2,2] = ''
	lacComments[3,1] = 'owner_id'
	lacComments[3,2] = ''
	lacComments[4,1] = 'team_id'
	lacComments[4,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF

ERASE 'teams.dbf'
ERASE 'teams.fpt'
ERASE 'teams.cdx'
ERASE 'teams.bak'
ERASE 'teams.tbk'

CREATE TABLE (m.tcPath + 'teams') &lcFreeOrName ( ;
id INTEGER NOT NULL , ;
name INTEGER NOT NULL  ;
)

lcTableComment = ''
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'name'
	lacComments[2,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF

ERASE 'employee_projects.dbf'
ERASE 'employee_projects.fpt'
ERASE 'employee_projects.cdx'
ERASE 'employee_projects.bak'
ERASE 'employee_projects.tbk'

CREATE TABLE (m.tcPath + 'employee_projects') &lcFreeOrName ( ;
employee_id INTEGER NOT NULL , ;
project_id INTEGER NOT NULL  ;
)

lcTableComment = ''
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'employee_id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'project_id'
	lacComments[2,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF