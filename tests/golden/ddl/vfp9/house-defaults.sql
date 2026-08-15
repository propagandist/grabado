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

ERASE 'users.dbf'
ERASE 'users.fpt'
ERASE 'users.cdx'
ERASE 'users.bak'
ERASE 'users.tbk'

CREATE TABLE (m.tcPath + 'users') &lcFreeOrName ( ;
id INTEGER NOT NULL uidv7( , ;
email INTEGER NOT NULL , ;
display_name INTEGER NOT NULL , ;
is_active INTEGER NOT NULL ru , ;
preferences INTEGER NOT NULL {}'::json , ;
created_at INTEGER NOT NULL ow( , ;
updated_at INTEGER NOT NULL ow(  ;
)

lcTableComment = 'ユーザー'
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'email'
	lacComments[2,2] = 'ログイン用メールアドレス'
	lacComments[3,1] = 'display_name'
	lacComments[3,2] = ''
	lacComments[4,1] = 'is_active'
	lacComments[4,2] = ''
	lacComments[5,1] = 'preferences'
	lacComments[5,2] = 'UI 設定などの任意項目'
	lacComments[6,1] = 'created_at'
	lacComments[6,2] = ''
	lacComments[7,1] = 'updated_at'
	lacComments[7,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF

ERASE 'articles.dbf'
ERASE 'articles.fpt'
ERASE 'articles.cdx'
ERASE 'articles.bak'
ERASE 'articles.tbk'

CREATE TABLE (m.tcPath + 'articles') &lcFreeOrName ( ;
id INTEGER NOT NULL uidv7( , ;
author_id INTEGER NOT NULL , ;
title INTEGER NOT NULL , ;
body INTEGER NULL , ;
view_count INTEGER NOT NULL  , ;
price INTEGER(12,2) NULL , ;
published_on INTEGER NULL , ;
created_at INTEGER NOT NULL ow( , ;
updated_at INTEGER NOT NULL ow(  ;
)

lcTableComment = '記事'
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'author_id'
	lacComments[2,2] = '執筆者 (users.id)'
	lacComments[3,1] = 'title'
	lacComments[3,2] = ''
	lacComments[4,1] = 'body'
	lacComments[4,2] = ''
	lacComments[5,1] = 'view_count'
	lacComments[5,2] = ''
	lacComments[6,1] = 'price'
	lacComments[6,2] = '有料記事の価格。money ではなく numeric を使う'
	lacComments[7,1] = 'published_on'
	lacComments[7,2] = ''
	lacComments[8,1] = 'created_at'
	lacComments[8,2] = ''
	lacComments[9,1] = 'updated_at'
	lacComments[9,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF

ERASE 'article_tags.dbf'
ERASE 'article_tags.fpt'
ERASE 'article_tags.cdx'
ERASE 'article_tags.bak'
ERASE 'article_tags.tbk'

CREATE TABLE (m.tcPath + 'article_tags') &lcFreeOrName ( ;
article_id INTEGER NOT NULL , ;
tag INTEGER NOT NULL , ;
created_at INTEGER NOT NULL ow(  ;
)

lcTableComment = '記事とタグの対応'
DIMENSION lacComments[FCOUNT(),2]
	lacComments[1,1] = 'article_id'
	lacComments[1,2] = ''
	lacComments[2,1] = 'tag'
	lacComments[2,2] = ''
	lacComments[3,1] = 'created_at'
	lacComments[3,2] = ''

IF NOT EMPTY( m.tcCommand )
	&tcCommand
ENDIF