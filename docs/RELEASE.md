# 发布

`package.json` 的 `version` 是唯一需要手改的地方，改完跑 `npm run version:sync`，然后 `bash scripts/release.sh`。

## 八步

```
version:check   版本四处一致
local gate      typecheck / lint / styling / tests
build           vite build
deploy          deploy:only（含启动探针）
mirror          把本仓已提交的文件复制进镜像仓并逐文件核对
mirror commit   把复制进去的东西提交并推 dev
tag             两个仓各打一个标注标签，并读 package.json 确认指向对
remote          推 dev，并检查 origin/main 是 origin/dev 的祖先
```

脚本在第一步失败就停，并说出是哪一步。这是为 v2.34.25 写的：那次的 deploy 失败了，而 main 和 tag 照旧被推了上去，线上是坏的而仓库说是好的。

## 顺序的规则

`deploy` 的位置是承重的。它之前的一切都只是关于构建的说法，它之后的一切都是关于线上是什么的说法。所以：

- 部署成功是推 main 和 tag 的前提。脚本自己保证这一点。
- 不要在发布跑的时候手工推镜像或 main。这条是我犯过的错：v2.34.31 发布期间我顺手推了镜像，等于绕过了上面那条前提。那次部署恰好是成功的，所以没造成后果，但顺序本身是错的，而它出错的方式是"看起来没事"。

如果确实需要在发布之后收尾，等 `release.sh` 退出再做。

## 部署之后的失败

`deploy` 之后、`remote` 之前的失败留下的是一个部分发布的版本：线上是新的，main 和 tag 不是。v2.34.29 就是这样，而脚本当时说的话是错的（它说"什么都没发布"，而线上已经在服务新版本）。现在失败路径按 `DEPLOYED` 标记分两句：部署前照旧说没发布，部署后明说线上已经是这个版本而 main 和 tag 不是。

## 怎么核对

不要读"推送成功"，读文件。三处各读一次：

```
线上   curl -s https://groove.wangda.today/version.json
dev    git -C ../release/groove-github show origin/dev:package.json
main   git -C ../release/groove-github show origin/main:package.json
tag    git -C ../release/groove-github show v<version>^{}:package.json
```

四个数都等于要发布的版本，才算成了。标签那一步用的就是这个判据：它不去看推送是否成功，而是拿 `-S` 找出承载该版本的提交，找不到就退出。v2.34.29 的标签就是这样被发现的——线上和部署都没问题，标签根本不存在。

## 推送被拒的几种情况

都会遇到，而处理方式不同：

| 现象 | 性质 |
| --- | --- |
| `Permission denied (publickey)` | SSH 认证，通常是瞬时，重试一次 |
| `remote rejected ... Internal Server Error` | GitHub 服务端，瞬时，重试一次 |
| `dev -> main` 被拒而 `dev` 成功 | 非快进。镜像仓里 main 本来就该等于 dev，用 `--force` 对齐 |

第三种容易被误读成认证问题。分辨方式是读错误的第一行，而不是最后一行——第一行说原因，最后一行只说"请确认你有权限"。
