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

ERASE 'type_samples.dbf'
ERASE 'type_samples.fpt'
ERASE 'type_samples.cdx'
ERASE 'type_samples.bak'
ERASE 'type_samples.tbk'

CREATE TABLE (m.tcPath + 'type_samples') &lcFreeOrName ( ;
c_integer INTEGER NULL , ;
c_smallint INTEGER NULL , ;
c_decimal INTEGER(12,2) NULL , ;
c_serial INTEGER NOT NULL , ;
c_bigserial INTEGER NOT NULL , ;
c_float INTEGER NULL , ;
c_double INTEGER NULL , ;
c_char INTEGER(10) NULL , ;
c_varchar INTEGER(255) NULL , ;
c_text INTEGER NULL , ;
c_bytea INTEGER NULL , ;
c_boolean INTEGER NULL , ;
c_date INTEGER NULL , ;
c_time INTEGER(3) NULL , ;
c_time_tz INTEGER NULL , ;
c_interval INTEGER(6) NULL , ;
c_timestamp INTEGER(3) NULL , ;
c_timestamp_tz INTEGER NULL , ;
c_timestamp_wo_tz INTEGER NULL , ;
c_xml INTEGER NULL , ;
c_bit INTEGER(8) NULL , ;
c_varbit INTEGER(8) NULL , ;
c_inet INTEGER NULL , ;
c_cidr INTEGER NULL , ;
c_geometry INTEGER NULL , ;
c_json INTEGER NULL , ;
c_jsonb INTEGER NULL  ;
)

lcTableComment = ''
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'c_integer'
	lacComments[1,2] = ''
	lacComments[2,1] = 'c_smallint'
	lacComments[2,2] = ''
	lacComments[3,1] = 'c_decimal'
	lacComments[3,2] = ''
	lacComments[4,1] = 'c_serial'
	lacComments[4,2] = ''
	lacComments[5,1] = 'c_bigserial'
	lacComments[5,2] = ''
	lacComments[6,1] = 'c_float'
	lacComments[6,2] = ''
	lacComments[7,1] = 'c_double'
	lacComments[7,2] = ''
	lacComments[8,1] = 'c_char'
	lacComments[8,2] = ''
	lacComments[9,1] = 'c_varchar'
	lacComments[9,2] = ''
	lacComments[10,1] = 'c_text'
	lacComments[10,2] = ''
	lacComments[11,1] = 'c_bytea'
	lacComments[11,2] = ''
	lacComments[12,1] = 'c_boolean'
	lacComments[12,2] = ''
	lacComments[13,1] = 'c_date'
	lacComments[13,2] = ''
	lacComments[14,1] = 'c_time'
	lacComments[14,2] = ''
	lacComments[15,1] = 'c_time_tz'
	lacComments[15,2] = ''
	lacComments[16,1] = 'c_interval'
	lacComments[16,2] = ''
	lacComments[17,1] = 'c_timestamp'
	lacComments[17,2] = ''
	lacComments[18,1] = 'c_timestamp_tz'
	lacComments[18,2] = ''
	lacComments[19,1] = 'c_timestamp_wo_tz'
	lacComments[19,2] = ''
	lacComments[20,1] = 'c_xml'
	lacComments[20,2] = ''
	lacComments[21,1] = 'c_bit'
	lacComments[21,2] = ''
	lacComments[22,1] = 'c_varbit'
	lacComments[22,2] = ''
	lacComments[23,1] = 'c_inet'
	lacComments[23,2] = ''
	lacComments[24,1] = 'c_cidr'
	lacComments[24,2] = ''
	lacComments[25,1] = 'c_geometry'
	lacComments[25,2] = ''
	lacComments[26,1] = 'c_json'
	lacComments[26,2] = ''
	lacComments[27,1] = 'c_jsonb'
	lacComments[27,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF