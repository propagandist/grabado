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

ERASE '顧客.dbf'
ERASE '顧客.fpt'
ERASE '顧客.cdx'
ERASE '顧客.bak'
ERASE '顧客.tbk'

CREATE TABLE (m.tcPath + '顧客') &lcFreeOrName ( ;
id INTEGER NOT NULL , ;
氏名 INTEGER NOT NULL , ;
say "hi" INTEGER NULL , ;
メモ INTEGER NULL  ;
)

lcTableComment = '顧客マスタ。''仮登録'' の状態も含む'
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = '氏名'
	lacComments[2,2] = '姓と名は分けない'
	lacComments[3,1] = 'say "hi"'
	lacComments[3,2] = '識別子に " が入る場合の属性エスケープ確認'
	lacComments[4,1] = 'メモ'
	lacComments[4,2] = '顧客の''愛称''をここに書く'

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF