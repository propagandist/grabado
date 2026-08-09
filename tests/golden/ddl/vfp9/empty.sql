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